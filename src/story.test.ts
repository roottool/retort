import { Option } from 'effect'
import { Command, given, message, model, story } from 'foldkit/story'
import { describe, expect, test } from 'vitest'

import { ClickedNode, initialModel, update } from './main'

describe('update', () => {
  test('clicking a node selects it and emits no command', () => {
    story(
      update,
      given(initialModel),
      message(ClickedNode({ id: 'Bucket' })),
      Command.expectNone(),
      model(model => {
        expect(model.selectedNodeId).toEqual(Option.some('Bucket'))
      }),
    )
  })

  test('clicking another node replaces the previous selection', () => {
    story(
      update,
      given(initialModel),
      message(ClickedNode({ id: 'Bucket' })),
      message(ClickedNode({ id: 'Api' })),
      model(model => {
        expect(model.selectedNodeId).toEqual(Option.some('Api'))
      }),
    )
  })
})
