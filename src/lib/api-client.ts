/**
 * API Client
 * Handles HTTP requests and SSE streaming
 */

import type { ConfigManager } from './config-manager'
import type { AuthManager } from './auth-manager'
import type { StreamChunk } from '../types/api'

export class APIError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public data?: any
  ) {
    super(message)
    this.name = 'APIError'
  }
}

interface RequestOptions {
  skipAuth?: boolean
  timeout?: number
}

export class APIClient {
  private baseUrl: string = ''
  private timeout: number = 300000 // 5 minutes

  constructor(
    private config: ConfigManager,
    private authManager?: AuthManager
  ) {}

  /**
   * Initialize client (load config)
   */
  async init(): Promise<void> {
    const cfg = await this.config.load()
    this.baseUrl = cfg.api_url || 'http://localhost:3000'
    this.timeout = cfg.timeout || 300000
  }

  /**
   * GET request
   */
  async get<T = any>(path: string, options: RequestOptions = {}): Promise<T> {
    return this.request('GET', path, options)
  }

  /**
   * POST request
   */
  async post<T = any>(
    path: string,
    body?: any,
    options: RequestOptions = {}
  ): Promise<T> {
    return this.request('POST', path, { ...options, body })
  }

  /**
   * PATCH request
   */
  async patch<T = any>(
    path: string,
    body?: any,
    options: RequestOptions = {}
  ): Promise<T> {
    return this.request('PATCH', path, { ...options, body })
  }

  /**
   * DELETE request
   */
  async delete<T = any>(
    path: string,
    body?: any,
    options: RequestOptions = {}
  ): Promise<T> {
    return this.request('DELETE', path, { ...options, body })
  }

  /**
   * Upload file via multipart form data
   */
  async upload<T = any>(
    path: string,
    formData: FormData,
    options: RequestOptions = {}
  ): Promise<T> {
    if (!this.baseUrl) {
      await this.init()
    }

    const url = `${this.baseUrl}${path}`
    const headers: Record<string, string> = {}

    // Add auth header (no Content-Type — let fetch set multipart boundary)
    if (!options.skipAuth && this.authManager) {
      try {
        headers['Authorization'] = await this.authManager.getAuthHeader()
      } catch (error) {
        // continue without auth
      }
    }

    const controller = new AbortController()
    const timeout = options.timeout || this.timeout
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: formData,
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      const contentType = response.headers.get('content-type')
      let data: any
      if (contentType?.includes('application/json')) {
        data = await response.json()
      } else {
        data = await response.text()
      }

      if (!response.ok) {
        const message =
          typeof data === 'object' && data.message
            ? data.message
            : typeof data === 'string'
            ? data
            : 'Upload failed'
        throw new APIError(response.status, message, data)
      }

      return data
    } catch (error: any) {
      clearTimeout(timeoutId)
      if (error.name === 'AbortError') throw new Error(`Upload timeout after ${timeout}ms`)
      if (error instanceof APIError) throw error
      throw new Error(`Network error: ${error.message}`)
    }
  }

  /**
   * Core HTTP request method
   */
  private async request(
    method: string,
    path: string,
    options: RequestOptions & { body?: any } = {}
  ): Promise<any> {
    if (!this.baseUrl) {
      await this.init()
    }

    const url = `${this.baseUrl}${path}`
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    // Add authentication header
    if (!options.skipAuth && this.authManager) {
      try {
        headers['Authorization'] = await this.authManager.getAuthHeader()
      } catch (error) {
        // If auth fails, continue without auth (may be public endpoint)
      }
    }

    // Timeout controller
    const controller = new AbortController()
    const timeout = options.timeout || this.timeout
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      // Parse response
      const contentType = response.headers.get('content-type')
      let data: any

      if (contentType?.includes('application/json')) {
        data = await response.json()
      } else {
        data = await response.text()
      }

      // Handle errors
      if (!response.ok) {
        const message =
          typeof data === 'object' && data.message
            ? data.message
            : typeof data === 'string'
            ? data
            : 'Request failed'

        throw new APIError(response.status, message, data)
      }

      return data
    } catch (error: any) {
      clearTimeout(timeoutId)

      if (error.name === 'AbortError') {
        throw new Error(`Request timeout after ${timeout}ms`)
      }

      if (error instanceof APIError) {
        throw error
      }

      throw new Error(`Network error: ${error.message}`)
    }
  }

  /**
   * Stream SSE from a POST request
   * Sends POST and reads SSE events from the response body
   */
  async *streamPOST(path: string, body: any): AsyncGenerator<StreamChunk, void, undefined> {
    if (!this.baseUrl) {
      await this.init()
    }

    const url = `${this.baseUrl}${path}`
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      'Cache-Control': 'no-cache',
    }

    if (this.authManager) {
      try {
        headers['Authorization'] = await this.authManager.getAuthHeader()
      } catch (error) {
        // continue without auth
      }
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.timeout)

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorText = await response.text()
        let message = `Stream request failed: ${response.statusText}`
        try {
          const errorData = JSON.parse(errorText)
          if (errorData.message) message = errorData.message
        } catch {}
        throw new APIError(response.status, message)
      }

      // Handle servers that return JSON instead of SSE (pre-upgrade fallback)
      const contentType = response.headers.get('content-type') || ''
      if (contentType.includes('application/json')) {
        const data = await response.json()

        if (data.executionId) {
          yield { type: 'meta', data: '', raw: data }
        }

        if (data.result) {
          yield { type: 'text', data: data.result }
          yield { type: 'done', data: '', raw: data }
          return
        }

        // Old server returns streamUrl but no result — re-request without streaming
        if (data.streamUrl && body) {
          const retryBody = { ...body, stream: false }
          const retryResponse = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(retryBody),
          })
          if (retryResponse.ok) {
            const retryData = await retryResponse.json()
            if (retryData.result) {
              yield { type: 'text', data: retryData.result }
            }
            yield { type: 'done', data: '', raw: { ...data, ...retryData } }
          } else {
            yield { type: 'done', data: '', raw: data }
          }
          return
        }

        yield { type: 'done', data: '', raw: data }
        return
      }

      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error('No response body for stream')
      }

      const decoder = new TextDecoder()
      let buffer = ''
      let currentToolName: string | null = null

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })

          // Split on double-newline (SSE message boundary)
          const messages = buffer.split('\n\n')
          buffer = messages.pop() || ''

          for (const message of messages) {
            if (!message.trim()) continue

            // Parse SSE event: extract event type and data
            let eventType = ''
            let eventData = ''

            for (const line of message.split('\n')) {
              if (line.startsWith('event: ')) {
                eventType = line.slice(7).trim()
              } else if (line.startsWith('data: ')) {
                eventData += (eventData ? '\n' : '') + line.slice(6)
              }
            }

            if (!eventData) continue

            // Route by event type
            if (eventType === 'error') {
              try {
                const parsed = JSON.parse(eventData)
                yield { type: 'error', data: parsed.message || eventData }
              } catch {
                yield { type: 'error', data: eventData }
              }
              return
            }

            if (eventType === 'meta') {
              try {
                yield { type: 'meta', data: '', raw: JSON.parse(eventData) }
              } catch {}
              continue
            }

            if (eventType === 'result' || eventType === 'done') {
              try {
                yield { type: 'done', data: '', raw: JSON.parse(eventData) }
              } catch {
                yield { type: 'done', data: '' }
              }
              return
            }

            // event: message — extract text content
            if (eventType === 'message' || !eventType) {
              try {
                const parsed = JSON.parse(eventData)

                // Unwrap stream event: computer service wraps Claude API events as
                // { messageType: 'stream_event', content: { event: {...} } }
                // or forwards raw events with type at top level
                const streamEvt = parsed.messageType === 'stream_event'
                  ? (parsed.content?.event || parsed.content || parsed)
                  : parsed

                // Tool use block start
                if (streamEvt.type === 'content_block_start' && streamEvt.content_block?.type === 'tool_use') {
                  currentToolName = streamEvt.content_block.name
                  yield { type: 'tool_start', data: streamEvt.content_block.name, raw: { id: streamEvt.content_block.id } }
                  continue
                }

                // Content block stop — emit tool_end if we were tracking a tool
                if (streamEvt.type === 'content_block_stop' && currentToolName) {
                  yield { type: 'tool_end', data: currentToolName }
                  currentToolName = null
                  continue
                }

                // Stream event with text delta
                if (parsed.messageType === 'stream_event' || parsed.type === 'content_block_delta') {
                  const text = streamEvt.delta?.text || parsed.delta?.text || parsed.text
                  if (text) {
                    yield { type: 'text', data: text }
                  }
                  continue
                }

                // Assistant message with content blocks
                if (parsed.messageType === 'assistant' || parsed.role === 'assistant') {
                  const content = parsed.content || parsed.message
                  if (typeof content === 'string') {
                    yield { type: 'text', data: content }
                  } else if (Array.isArray(content)) {
                    for (const block of content) {
                      if (block.type === 'text' && block.text) {
                        yield { type: 'text', data: block.text }
                      }
                    }
                  }
                  continue
                }

                // Fallback: yield any text-like data
                if (parsed.text) {
                  yield { type: 'text', data: parsed.text }
                }
              } catch {
                // Not JSON, yield as plain text
                yield { type: 'text', data: eventData }
              }
            }
          }
        }

        // Process remaining buffer
        if (buffer.trim()) {
          yield { type: 'text', data: buffer }
        }
      } finally {
        reader.releaseLock()
      }
    } catch (error: any) {
      clearTimeout(timeoutId)
      if (error.name === 'AbortError') {
        throw new Error(`Stream timeout after ${this.timeout}ms`)
      }
      if (error instanceof APIError) throw error
      throw new Error(`Network error: ${error.message}`)
    }
  }

  /**
   * Stream Server-Sent Events (SSE) via GET
   * Returns an async generator of stream chunks
   */
  async *streamSSE(url: string): AsyncGenerator<StreamChunk> {
    if (!this.baseUrl) {
      await this.init()
    }

    const fullUrl = `${this.baseUrl}${url}`
    const headers: Record<string, string> = {
      Accept: 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    }

    // Add auth header
    if (this.authManager) {
      try {
        headers['Authorization'] = await this.authManager.getAuthHeader()
      } catch (error) {
        console.error('Failed to get auth header for streaming:', error)
      }
    }

    const response = await fetch(fullUrl, {
      method: 'GET',
      headers,
    })

    if (!response.ok) {
      throw new APIError(
        response.status,
        `Stream failed: ${response.statusText}`
      )
    }

    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('No response body for stream')
    }

    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()

        if (done) {
          break
        }

        // Decode chunk
        buffer += decoder.decode(value, { stream: true })

        // Process complete lines
        const lines = buffer.split('\n')
        buffer = lines.pop() || '' // Keep incomplete line in buffer

        for (const line of lines) {
          // Parse SSE format
          if (line.startsWith('data: ')) {
            try {
              const data = line.slice(6) // Remove 'data: ' prefix
              const parsed = JSON.parse(data)

              // Yield structured chunk
              if (typeof parsed === 'string') {
                yield { type: 'text', data: parsed }
              } else if (parsed.type) {
                yield parsed as StreamChunk
              } else {
                yield { type: 'text', data: JSON.stringify(parsed) }
              }
            } catch (error) {
              // If not JSON, yield as plain text
              yield { type: 'text', data: line.slice(6) }
            }
          } else if (line.startsWith('event: ')) {
            // Handle named events if needed
            const eventType = line.slice(7)
            if (eventType === 'done' || eventType === 'end') {
              yield { type: 'done', data: '' }
              return
            }
          } else if (line.startsWith('error: ')) {
            yield { type: 'error', data: line.slice(7) }
          }
        }
      }

      // Process any remaining buffer
      if (buffer.trim()) {
        yield { type: 'text', data: buffer }
      }
    } finally {
      reader.releaseLock()
    }
  }

  /**
   * Get base URL
   */
  getBaseUrl(): string {
    return this.baseUrl
  }
}
