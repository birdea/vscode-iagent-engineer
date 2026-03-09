const http = require('http');

const PORT = Number(process.env.MOCK_MCP_PORT || 3845);

const server = http.createServer((req, res) => {
  if (req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });

    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const { id, method, params } = payload;

        console.log(`[Mock Server] Received method: ${method}`);

        const response = {
          jsonrpc: '2.0',
          id: id,
        };

        if (method === 'initialize') {
          response.result = {
            capabilities: { tools: {} },
            serverInfo: { name: 'mock-figma-mcp', version: '0.1' },
          };
        } else if (method === 'tools/list') {
          response.result = {
            tools: [
              { name: 'get_file', description: 'Mock get file' },
              { name: 'get_image', description: 'Mock get image' },
              { name: 'get_selection', description: 'Mock get selection' },
            ],
          };
        } else if (method === 'tools/call') {
          const { name } = params;
          if (name === 'get_file') {
            response.result = {
              fileId: params.arguments?.fileId || params.arguments?.fileKey || 'mock-file-123',
              name: 'Mock Figma Design',
              lastModified: new Date().toISOString(),
              version: '1.0',
              document: {
                id: params.arguments?.nodeId || '0:0',
                name: 'Mock Frame',
                type: 'FRAME',
                children: [
                  {
                    id: '0:1',
                    name: 'Mock Button',
                    type: 'INSTANCE',
                    componentId: 'mock-button-component',
                  },
                  {
                    id: '0:2',
                    name: 'Mock Text',
                    type: 'TEXT',
                    characters: 'Hello, this is a mock Figma node!',
                  },
                ],
              },
            };
          } else if (name === 'get_image') {
            response.result = {
              base64:
                'iVBORw0KGgoAAAANSUhEUgAAAGQAAABkAQMAAABKLAcXAAAABlBMVEX///8AAABVwtN+AAAAAXRSTlMAQObYZgAAABRJREFUeAFjGHxgwEFRYEFjEFwAAC/qEwG267YfAAAAAElFTkSuQmCC',
              format: 'png',
              fileId: params.arguments?.fileId,
              nodeId: params.arguments?.nodeId,
            };
          } else {
            response.error = { code: -32601, message: `Method not found: ${name}` };
          }
        } else {
          response.error = { code: -32601, message: 'Method not found' };
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(response));
      } catch (err) {
        console.error('Failed to parse request:', err);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({ jsonrpc: '2.0', error: { code: -32700, message: 'Parse error' } }),
        );
      }
    });
  } else {
    res.writeHead(405, { 'Content-Type': 'text/plain' });
    res.end('Method not allowed\n');
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[Mock Server] Listening on http://localhost:${PORT}/`);
  console.log('[Mock Server] Ready to mock Figma MCP interactions!');
});
