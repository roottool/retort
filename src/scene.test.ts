import { click, expect, given, scene, selector, text } from 'foldkit/scene'
import { describe, test } from 'vitest'

import { initialModel, update } from './main'
import { view } from './view'

describe('scene', () => {
	test('renders every resource and its binding types', () => {
		scene(
			{ update, view },
			given(initialModel),
			expect(text('Api')).toExist(),
			expect(text('Auth')).toExist(),
			expect(text('Sessions')).toExist(),
			expect(text('Db')).toExist(),
			expect(text('Viewer')).toExist(),
			expect(text('Cloudflare.Worker')).toExist(),
			expect(text('Cloudflare.KV.Namespace')).toExist(),
			expect(text('Cloudflare.D1Database')).toExist(),
			expect(text('Cloudflare.Workers.Assets')).toExist(),
			expect(text('kv_namespace')).toExist(),
			expect(text('d1')).toExist(),
			expect(text('service')).toExist(),
			expect(text('assets')).toExist(),
		)
	})

	test('clicking a node shows its details', () => {
		scene(
			{ update, view },
			given(initialModel),
			expect(text('Click a node to see its details')).toExist(),
			click(selector('#Sessions')),
			expect(text('Selected: Sessions (Cloudflare.KV.Namespace)')).toExist(),
		)
	})

	test('clicking a node highlights its neighbors and dims the rest', () => {
		scene(
			{ update, view },
			given(initialModel),
			// Auth only connects to Api and Db directly; Sessions and Viewer are
			// reachable from Api but not from Auth, so they stay dimmed.
			click(selector('#Auth')),
			expect(selector('#Api')).toHaveClass('node-neighbor'),
			expect(selector('#Db')).toHaveClass('node-neighbor'),
			expect(selector('#Sessions')).not.toHaveClass('node-neighbor'),
			expect(selector('#Sessions')).toHaveAttr('opacity', '0.35'),
			expect(selector('#Viewer')).toHaveAttr('opacity', '0.35'),
		)
	})
})
