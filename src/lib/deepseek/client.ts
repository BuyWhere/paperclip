/**
 * DeepSeek API client.
 * Uses the OpenAI-compatible REST interface at api.deepseek.com.
 * Model: deepseek-chat (free tier)
 */

export interface DeepSeekMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface DeepSeekResponse {
  choices: Array<{
    message: { role: string; content: string }
    finish_reason: string
  }>
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

const BASE_URL = 'https://api.deepseek.com/v1'

export async function deepseekChat(
  messages: DeepSeekMessage[],
  opts: { maxTokens?: number; temperature?: number } = {},
): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY is not set')

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30_000)

  try {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages,
        max_tokens: opts.maxTokens ?? 400,
        temperature: opts.temperature ?? 0.8,
        stream: false,
      }),
      signal: controller.signal,
    })

    if (!res.ok) {
      const body = await res.text()
      throw new Error(`DeepSeek API error ${res.status}: ${body}`)
    }

    const data: DeepSeekResponse = await res.json()
    const content = data.choices?.[0]?.message?.content?.trim()
    if (!content) throw new Error('DeepSeek returned empty content')
    return content
  } finally {
    clearTimeout(timeout)
  }
}
