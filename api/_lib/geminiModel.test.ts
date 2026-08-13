import { describe, it, expect } from 'vitest'
import {
  DEFAULT_GEMINI_MODEL,
  geminiEndpoint,
  isModelNotFoundStatus,
  modelNotFoundMessage,
  resolveGeminiModel,
} from './geminiModel.js'

describe('resolveGeminiModel', () => {
  it('uses GEMINI_MODEL when set', () => {
    expect(resolveGeminiModel({ GEMINI_MODEL: 'gemini-9-flash' } as NodeJS.ProcessEnv)).toBe('gemini-9-flash')
  })

  it('trims surrounding whitespace, which a dashboard paste often carries', () => {
    expect(resolveGeminiModel({ GEMINI_MODEL: '  gemini-9-flash \n' } as NodeJS.ProcessEnv)).toBe('gemini-9-flash')
  })

  it.each([{}, { GEMINI_MODEL: '' }, { GEMINI_MODEL: '   ' }])(
    'falls back to the default for %j',
    (env) => {
      expect(resolveGeminiModel(env as NodeJS.ProcessEnv)).toBe(DEFAULT_GEMINI_MODEL)
    }
  )

  // The whole point of this module. gemini-2.0-flash was shut down on
  // 1 June 2026 while its id sat hardcoded in two API handlers, and the
  // resulting 404s disabled AI classification for ~10 weeks in silence.
  it('does not default to a model Google has retired', () => {
    expect(DEFAULT_GEMINI_MODEL).not.toMatch(/gemini-(1\.|1_|2\.)/)
  })
})

describe('geminiEndpoint', () => {
  it('builds a v1beta generateContent URL for the given model and key', () => {
    expect(geminiEndpoint('KEY123', 'gemini-9-flash')).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-9-flash:generateContent?key=KEY123'
    )
  })
})

describe('isModelNotFoundStatus', () => {
  it('treats 404 as a dead model id', () => {
    expect(isModelNotFoundStatus(404)).toBe(true)
  })

  it.each([400, 401, 403, 429, 500, 502, 503, 504])('does not treat %i as a dead model id', (status) => {
    expect(isModelNotFoundStatus(status)).toBe(false)
  })
})

describe('modelNotFoundMessage', () => {
  it('names the failing model and the env var that fixes it', () => {
    const message = modelNotFoundMessage('gemini-2.0-flash')
    expect(message).toContain('gemini-2.0-flash')
    expect(message).toContain('GEMINI_MODEL')
  })
})
