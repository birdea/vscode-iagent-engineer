import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { buildPreviewPanelContent } from '../../src/preview/PreviewRuntimeBuilder';

suite('PreviewRuntimeBuilder', () => {
  const tsconfigPath = path.join(process.cwd(), 'tsconfig.json');

  test('falls back to static preview when non-react imports are present', async () => {
    const content = await buildPreviewPanelContent(
      `
        import React from 'react';
        import { motion } from 'framer-motion';

        export default function App() {
          return <motion.div className="bg-slate-900 text-white">preview</motion.div>;
        }
      `,
      'csp',
      'tsx',
    );

    assert.ok(content.title.includes('React / TSX Preview'));
    assert.ok(content.html.includes('static fallback is shown'));
    assert.ok(content.html.includes('Fallback Reason'));
    assert.ok(content.html.includes('Unsupported imports: framer-motion'));
    assert.ok(content.html.includes('<iframe'));
  });

  test('runtime preview renders structured status details', async () => {
    const content = await buildPreviewPanelContent(
      `
        import React from 'react';
        export default function App() {
          return <div className="bg-white">preview</div>;
        }
      `,
      'csp',
      'tsx',
    );

    assert.ok(content.title.includes('React / TSX Preview'));
    assert.ok(content.html.includes('Runtime Status'));
    assert.ok(content.html.includes('Single-file React output is executed directly'));
    assert.ok(content.html.includes('runtime-error'));
  });

  test('runtime preview resolves relative imports from local files', async () => {
    const tempRoot = fs.mkdtempSync(path.join(process.cwd(), 'preview-runtime-'));
    const childPath = path.join(tempRoot, 'Child.tsx');

    try {
      fs.writeFileSync(
        childPath,
        "import React from 'react'; export function Child(){ return <div>Imported Child</div>; }",
      );

      const content = await buildPreviewPanelContent(
        `
          import React from 'react';
          import { Child } from './${path.basename(tempRoot)}/Child';

          export default function App() {
            return <Child />;
          }
        `,
        'csp',
        'tsx',
      );

      assert.ok(content.html.includes('Runtime Status'));
      assert.ok(content.html.includes('Imported Child'));
      assert.ok(!content.html.includes('Fallback Reason'));
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  test('runtime preview resolves @/ alias imports from src', async () => {
    const tempRoot = fs.mkdtempSync(path.join(process.cwd(), 'src', 'preview-alias-'));
    const childPath = path.join(tempRoot, 'Child.tsx');

    try {
      fs.writeFileSync(
        childPath,
        "import React from 'react'; export default function Child(){ return <div>Aliased Child</div>; }",
      );

      const content = await buildPreviewPanelContent(
        `
          import React from 'react';
          import Child from '@/${path.basename(tempRoot)}/Child';

          export default function App() {
            return <Child />;
          }
        `,
        'csp',
        'tsx',
      );

      assert.ok(content.html.includes('Aliased Child'));
      assert.ok(!content.html.includes('Fallback Reason'));
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  test('runtime preview resolves wildcard tsconfig path aliases', async () => {
    const originalTsconfig = fs.readFileSync(tsconfigPath, 'utf8');
    const aliasRoot = path.join(process.cwd(), 'preview-paths-fixture');
    const childPath = path.join(aliasRoot, 'components', 'Child.tsx');

    try {
      fs.mkdirSync(path.dirname(childPath), { recursive: true });
      fs.writeFileSync(
        childPath,
        "import React from 'react'; export default function Child(){ return <div>Wildcard Alias Child</div>; }",
      );

      const tsconfig = JSON.parse(originalTsconfig) as {
        compilerOptions?: Record<string, unknown>;
      };
      tsconfig.compilerOptions = {
        ...(tsconfig.compilerOptions ?? {}),
        baseUrl: '.',
        paths: {
          '@preview/*': ['preview-paths-fixture/*'],
        },
      };
      fs.writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 2));

      const content = await buildPreviewPanelContent(
        `
          import React from 'react';
          import Child from '@preview/components/Child';

          export default function App() {
            return <Child />;
          }
        `,
        'csp',
        'tsx',
      );

      assert.ok(content.html.includes('Wildcard Alias Child'));
      assert.ok(!content.html.includes('Fallback Reason'));
    } finally {
      fs.writeFileSync(tsconfigPath, originalTsconfig);
      fs.rmSync(aliasRoot, { recursive: true, force: true });
    }
  });
});
