import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createSecureContext, TLSSocket } from 'node:tls';
import { createAuditClient } from '../scripts/audit/run-supabase-audit-readonly.ts';

const host = 'aws-0-eu-central-1.pooler.supabase.com';
const url = `postgresql://postgres.gqkjqhpmyejmehbuombk:synthetic-test-password@${host}:5432/postgres`;

test('Audit pg client retains verified TLS after URL parsing and rejects downgrade modes', () => {
  const previous = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  try {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    assert.throws(() => createAuditClient(url), /refuses a global TLS verification bypass/);
  } finally {
    if (previous === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    else process.env.NODE_TLS_REJECT_UNAUTHORIZED = previous;
  }
  for (const suffix of ['', '?sslmode=require', '?sslmode=verify-ca', '?sslmode=verify-full', '?SSLMODE=require']) {
    const client = createAuditClient(url + suffix);
    assert.equal(client.connectionParameters.ssl.rejectUnauthorized, true);
    assert.equal(client.connection.ssl.rejectUnauthorized, true);
    assert.equal(client.host, host);
    assert.match(client.connectionParameters.options, /default_transaction_read_only=on/);
  }
  for (const mode of ['disable', 'allow', 'prefer', 'no-verify', 'unknown', '']) {
    assert.throws(() => createAuditClient(`${url}?sslmode=${mode}`), /sslmode must require verified TLS/);
  }
  for (const key of ['ssl', 'sslcert', 'sslkey', 'sslrootcert']) {
    assert.throws(() => createAuditClient(`${url}?${key}=anything`), /Query parameter not permitted/);
  }
});

// A disposable PostgreSQL wire-protocol peer tests the actual pg TLS handshake.
// Only its TCP destination is redirected to loopback; pg still verifies the
// authorized production hostname. No real credentials or external connection.
for (const scenario of ['untrusted', 'wrong-host', 'trusted-host'] as const) {
  test(`Audit TLS handshake: ${scenario}`, { timeout: 15000 }, async () => {
    const dir = mkdtempSync(join(tmpdir(), 'audit-tls-'));
    const sockets = new Set<Socket>();
    let startupCount = 0;
    let passwordCount = 0;
    let sslRequests = 0;
    const certificateHost = scenario === 'wrong-host' ? 'wrong-host.invalid' : host;
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
      '-keyout', join(dir, 'key.pem'), '-out', join(dir, 'cert.pem'), '-subj', `/CN=${certificateHost}`,
      '-addext', `subjectAltName=DNS:${certificateHost}`], { stdio: 'ignore' });
    const cert = readFileSync(join(dir, 'cert.pem'));
    const context = createSecureContext({ key: readFileSync(join(dir, 'key.pem')), cert });
    const server = createServer(socket => {
      sockets.add(socket);
      socket.on('close', () => sockets.delete(socket));
      socket.once('data', request => {
        assert.equal(request.length, 8);
        assert.equal(request.readInt32BE(4), 80877103);
        sslRequests++;
        socket.write('S');
        const tls = new TLSSocket(socket, { isServer: true, secureContext: context });
        tls.on('error', () => { /* Certificate rejection is expected in two cases. */ });
        let phase = 'startup';
        let pending = Buffer.alloc(0);
        tls.on('data', chunk => {
          pending = Buffer.concat([pending, chunk]);
          if (phase === 'startup' && pending.length >= 4 && pending.length >= pending.readInt32BE(0)) {
            startupCount++;
            pending = pending.subarray(pending.readInt32BE(0));
            phase = 'password';
            // AuthenticationCleartextPassword inside the verified TLS channel.
            tls.write(Buffer.from([82, 0, 0, 0, 8, 0, 0, 0, 3]));
          } else if (phase === 'password' && pending.length >= 5 && pending.length >= pending.readInt32BE(1) + 1) {
            assert.equal(pending[0], 112);
            assert.equal(pending.subarray(5, pending.readInt32BE(1)).toString(), 'synthetic-test-password');
            passwordCount++;
            pending = Buffer.alloc(0);
            phase = 'ready';
            // AuthenticationOk then ReadyForQuery; no queries are requested.
            tls.write(Buffer.from([82, 0, 0, 0, 8, 0, 0, 0, 0, 90, 0, 0, 0, 5, 73]));
          } else if (phase === 'ready' && pending[0] === 88) {
            tls.end();
          }
        });
      });
    });
    const client = createAuditClient(url + '?sslmode=require');
    try {
      await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
      const address = server.address();
      assert.ok(address && typeof address === 'object');
      const socket = client.connection.stream as Socket;
      const connect = socket.connect.bind(socket);
      socket.connect = (() => connect({ port: address.port, host: '127.0.0.1' })) as typeof socket.connect;
      // Trust this ephemeral test CA only in the hostname/positive tests.
      if (scenario !== 'untrusted') client.ssl.ca = cert;
      if (scenario === 'trusted-host') {
        await client.connect();
        assert.equal(startupCount, 1);
        assert.equal(passwordCount, 1, 'positive control demonstrates that the peer can observe authentication');
      } else {
        await assert.rejects(client.connect(), (error: NodeJS.ErrnoException) => {
          assert.equal(error.code, scenario === 'wrong-host' ? 'ERR_TLS_CERT_ALTNAME_INVALID' : 'DEPTH_ZERO_SELF_SIGNED_CERT');
          return true;
        });
        assert.equal(startupCount, 0, 'reject before PostgreSQL startup/authentication');
        assert.equal(passwordCount, 0, 'do not send credentials to an unverified peer');
      }
      assert.equal(sslRequests, 1);
    } finally {
      await client.end();
      for (const socket of sockets) socket.destroy();
      await new Promise<void>(resolve => server.close(() => resolve()));
      rmSync(dir, { recursive: true, force: true });
    }
  });
}
