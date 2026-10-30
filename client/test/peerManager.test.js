import test from 'node:test';
import assert from 'node:assert/strict';
import { PeerManager } from '../src/webrtc/PeerManager.js';

class FakePeerConnection {
  static instances = [];

  constructor(config) {
    this.config = config;
    this.connectionState = 'new';
    this.signalingState = 'stable';
    this.transceivers = [];
    this.candidates = [];
    FakePeerConnection.instances.push(this);
  }

  addTransceiver(kind, options) {
    const transceiver = { kind, direction: options.direction };
    this.transceivers.push(transceiver);
    return transceiver;
  }

  async addIceCandidate(candidate) {
    this.candidates.push(candidate);
  }

  close() {
    this.connectionState = 'closed';
  }
}

test('keeps an ICE candidate that arrives before the peer negotiation event', async () => {
  const previous = globalThis.RTCPeerConnection;
  globalThis.RTCPeerConnection = FakePeerConnection;
  FakePeerConnection.instances = [];
  const manager = new PeerManager({ socket: { emit() {} }, getLocalStream: () => null });
  const candidate = { candidate: 'candidate:local', sdpMid: '0', sdpMLineIndex: 0 };

  try {
    await manager.handleSignal({ from: 'remote-peer', generation: 3, data: { type: 'candidate', candidate } });
    await manager.handleNegotiate({
      peer: { id: 'remote-peer', name: 'Remote' },
      generation: 3,
      initiator: false,
      soundFactor: 1,
    });

    const connection = manager.connections.get('remote-peer');
    assert.ok(connection);
    assert.deepEqual(connection.pendingCandidates, [candidate]);
  } finally {
    manager.closeAll();
    if (previous === undefined) delete globalThis.RTCPeerConnection;
    else globalThis.RTCPeerConnection = previous;
  }
});

test('creates a receive-only audio transceiver for a listen-only participant', async () => {
  const previous = globalThis.RTCPeerConnection;
  globalThis.RTCPeerConnection = FakePeerConnection;
  FakePeerConnection.instances = [];
  const manager = new PeerManager({ socket: { emit() {} }, getLocalStream: () => null });

  try {
    await manager.handleNegotiate({
      peer: { id: 'remote-peer', name: 'Remote' },
      generation: 1,
      initiator: false,
      soundFactor: 1,
    });
    assert.deepEqual(FakePeerConnection.instances[0].transceivers, [{ kind: 'audio', direction: 'recvonly' }]);
  } finally {
    manager.closeAll();
    if (previous === undefined) delete globalThis.RTCPeerConnection;
    else globalThis.RTCPeerConnection = previous;
  }
});
