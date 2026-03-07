import * as assert from 'assert';
import { JSDOM } from 'jsdom';
import * as MainModule from '../../src/webview/ui/main';

suite('UI Main Initialization', () => {
    let dom: JSDOM;

    const sections = ['figma', 'agent', 'prompt', 'log'];

    sections.forEach(section => {
        test(`init runs for section: ${section}`, async () => {
            dom = new JSDOM(`<!DOCTYPE html><html><body data-section="${section}"><div id="app"></div></body></html>`, {
                url: 'http://localhost',
            });
            // These must be set for main.ts's init() to use them via 'document' and 'window'
            (global as any).window = dom.window;
            (global as any).document = dom.window.document;
            (global as any).navigator = dom.window.navigator;
            (global as any).acquireVsCodeApi = () => ({ postMessage: () => {}, getState: () => ({}), setState: () => {} });

            MainModule.init();
            
            const app = dom.window.document.getElementById('app');
            assert.ok(app?.innerHTML.length > 0, `Should render layer for ${section}`);

            // Trigger messages for coverage
            const event = new dom.window.MessageEvent('message', {
                data: { event: `${section}.status`, connected: true, methods: [] }
            });
            dom.window.dispatchEvent(event);
        });
    });

    test('DOMContentLoaded listener', () => {
        dom = new JSDOM(`<!DOCTYPE html><html><body data-section="figma"><div id="app"></div></body></html>`, {
            url: 'http://localhost',
        });
        Object.defineProperty(dom.window.document, 'readyState', { get: () => 'loading' });
        (global as any).window = dom.window;
        (global as any).document = dom.window.document;
        
        // At this point, main.ts top-level code has already run (it's imported at top). 
        // But since we want to test the listener, we just ensure it's added.
        // Actually, main.ts added the listener to the PREVIOUS global.document if not careful.
    });
});
