import { describe, it, expect } from 'vitest'
import { removeSavedRow } from './DrillDownModal'

describe('removeSavedRow', () => {
  it('removes the given id from the visible list', () => {
    const visible = [{ id: '1' }, { id: '2' }, { id: '3' }]
    expect(removeSavedRow(visible, '2')).toEqual([{ id: '1' }, { id: '3' }])
  })

  it('returns the same list unchanged if the id is not present', () => {
    const visible = [{ id: '1' }, { id: '2' }]
    expect(removeSavedRow(visible, 'missing')).toEqual([{ id: '1' }, { id: '2' }])
  })

  it('returns an empty array when removing the only row', () => {
    expect(removeSavedRow([{ id: '1' }], '1')).toEqual([])
  })
})
