import { click, expect, given, scene, selector, text } from 'foldkit/scene'
import { describe, test } from 'vitest'

import { initialModel, update } from './main'
import { view } from './view'

describe('scene', () => {
  test('renders every resource and its binding types', () => {
    scene(
      { update, view },
      given(initialModel),
      expect(text('Bucket')).toExist(),
      expect(text('Sessions')).toExist(),
      expect(text('Api')).toExist(),
      expect(text('Cloudflare.R2.Bucket')).toExist(),
      expect(text('Cloudflare.KV.Namespace')).toExist(),
      expect(text('Cloudflare.Worker')).toExist(),
      expect(text('r2_bucket')).toExist(),
      expect(text('kv_namespace')).toExist(),
    )
  })

  test('clicking a node shows its details', () => {
    scene(
      { update, view },
      given(initialModel),
      expect(
        text('ノードをクリックすると詳細が表示されます'),
      ).toExist(),
      click(selector('#Bucket')),
      expect(text('選択中: Bucket (Cloudflare.R2.Bucket)')).toExist(),
    )
  })
})
