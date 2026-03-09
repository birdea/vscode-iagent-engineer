import * as assert from 'assert';
import { buildPreviewDocument } from '../../src/preview/PreviewRenderer';

suite('PreviewRenderer', () => {
  test('react preview prefers the default export component body', () => {
    const code = `
import React from 'react';

const imgProfile = "http://localhost:3845/assets/profile.png";

function Keyword() {
  return <div className="bg-black text-white">keyword</div>;
}

export default function AppLayout() {
  return (
    <div className="bg-white relative w-[1169px] h-[661px] overflow-hidden">
      <img src={imgProfile} className="w-[34px] h-[34px]" alt="profile" />
      <div className="absolute left-0 top-0 bg-[#f7f7f7] w-[57px] h-full"></div>
    </div>
  );
}
`;

    const preview = buildPreviewDocument(code, 'tsx');

    assert.strictEqual(preview.detectedFormat, 'react');
    assert.strictEqual(preview.renderable, true);
    assert.ok(preview.html.includes('width: 1169px'));
    assert.ok(preview.html.includes('height: 661px'));
    assert.ok(preview.html.includes('background-color: white'));
    assert.ok(preview.html.includes('http://localhost:3845/assets/profile.png'));
    assert.ok(!preview.html.includes('background-color: black'));
  });
});
