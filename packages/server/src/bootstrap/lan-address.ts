import { networkInterfaces } from 'node:os'

// Picks the IPv4 address this machine should advertise in its own startup
// banner. Studio used to share this with LAN device discovery; discovery is
// gone, so the address selection now lives next to its only remaining caller.

interface LanIPv4Interface {
  name: string
  address: string
  netmask: string
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.').map(part => Number.parseInt(part, 10))
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return null
  return (((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3]) >>> 0
}

function getIpv4Interfaces(): LanIPv4Interface[] {
  try {
    return Object.entries(networkInterfaces()).flatMap(([name, addresses]) => (
      (addresses || [])
        .filter(item => item.family === 'IPv4' && !item.internal && item.address && item.netmask)
        .map(item => ({ name, address: item.address, netmask: item.netmask }))
    ))
  } catch {
    return []
  }
}

function isLikelyVirtualInterface(name: string): boolean {
  const normalized = String(name || '').trim().toLowerCase()
  return /^(?:utun|tun(?:\d|$)|tap(?:\d|$)|ppp(?:\d|$)|ipsec|wg(?:\d|$)|gif\d|stf\d|awdl\d|llw\d|bridge\d|docker\d|veth|virbr|vmnet|vboxnet|br-)/.test(normalized)
    || /(?:vpn|openvpn|wireguard|wintun|tailscale|zerotier|zero tier|hamachi|clash|mihomo|sing[ -]?box|surge|cloudflare warp|tunnel|virtual|hyper-v|wsl|隧道|虚拟)/.test(normalized)
}

function isLikelyPhysicalInterface(name: string): boolean {
  const normalized = String(name || '').trim().toLowerCase()
  return /^(?:en\d+|eth\d+|enp\w+|eno\w+|ens\w+|wlan\d+|wl\w+)$/.test(normalized)
    || /(?:wi-?fi|wireless|wlan|ethernet|以太网|无线)/.test(normalized)
}

function isRfc1918IPv4(ip: string): boolean {
  const value = ipv4ToInt(ip)
  if (value === null) return false
  const first = (value >>> 24) & 255
  const second = (value >>> 16) & 255
  return first === 10 || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168)
}

function interfacePreference(iface: LanIPv4Interface): number {
  let score = 0
  if (isLikelyPhysicalInterface(iface.name)) score += 100
  if (isRfc1918IPv4(iface.address)) score += 50
  if (iface.address.startsWith('169.254.')) score -= 50
  if (iface.netmask === '255.255.255.255') score -= 20
  return score
}

function normalizeRemoteAddress(value: string): string {
  const address = String(value || '').trim()
  return address.startsWith('::ffff:') ? address.slice('::ffff:'.length) : address
}

export function selectLanIPv4Address(
  remoteAddress: string,
  interfaces: LanIPv4Interface[] = getIpv4Interfaces(),
): string {
  const remote = ipv4ToInt(normalizeRemoteAddress(remoteAddress))
  if (remote !== null) {
    for (const iface of interfaces) {
      const ip = ipv4ToInt(iface.address)
      const mask = ipv4ToInt(iface.netmask)
      if (ip !== null && mask !== null && (ip & mask) === (remote & mask)) return iface.address
    }
  }

  const nonVirtualInterfaces = interfaces.filter(iface => !isLikelyVirtualInterface(iface.name))
  const candidates = nonVirtualInterfaces.length ? nonVirtualInterfaces : interfaces
  return candidates
    .map((iface, index) => ({ iface, index, score: interfacePreference(iface) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)[0]?.iface.address || '127.0.0.1'
}