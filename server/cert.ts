import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { generate } from 'selfsigned';

const CERT_DIR = join(import.meta.dirname, '.cert');

interface CachedCert {
  key: string;
  cert: string;
  hosts: string[];
  expires: number;
}

/**
 * Returns a self-signed certificate covering localhost and every given LAN IP.
 * Cached on disk so phones only need to accept the warning again when the IPs change.
 */
export async function getCertificate(ips: string[]): Promise<{ key: string; cert: string }> {
  const hosts = ['localhost', '127.0.0.1', ...ips].sort();
  const file = join(CERT_DIR, 'cert.json');

  if (existsSync(file)) {
    try {
      const cached = JSON.parse(readFileSync(file, 'utf8')) as CachedCert;
      const sameHosts = cached.hosts.length === hosts.length && cached.hosts.every((h, i) => h === hosts[i]);
      if (sameHosts && cached.expires > Date.now() + 7 * 864e5) {
        return { key: cached.key, cert: cached.cert };
      }
    } catch {
      // fall through and regenerate
    }
  }

  console.log('Generating self-signed HTTPS certificate…');
  const notBeforeDate = new Date(Date.now() - 864e5);
  const notAfterDate = new Date(Date.now() + 825 * 864e5);
  const pems = await generate([{ name: 'commonName', value: 'Kart Racer (local)' }], {
    keySize: 2048,
    algorithm: 'sha256',
    notBeforeDate,
    notAfterDate,
    extensions: [
      { name: 'basicConstraints', cA: false },
      { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
      { name: 'extKeyUsage', serverAuth: true },
      {
        name: 'subjectAltName',
        altNames: hosts.map((h) => (/^[\d.]+$/.test(h) ? { type: 7 as const, ip: h } : { type: 2 as const, value: h })),
      },
    ],
  });

  mkdirSync(CERT_DIR, { recursive: true });
  const cached: CachedCert = { key: pems.private, cert: pems.cert, hosts, expires: notAfterDate.getTime() };
  writeFileSync(file, JSON.stringify(cached));
  return { key: pems.private, cert: pems.cert };
}
