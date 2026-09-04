'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { ArrowRight, Radio, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  type ActivityItem, type Market, type Payout, type Player, type Screen, type Session, type Snapshot, type TradeMessage,
  COLORS, STARTING_BALANCE, betCode, now, odds, uid,
} from './types';
import { Header } from './header';
import { HostForm } from './host-form';
import { JoinForm } from './join-form';
import { BetView } from './bet-view';

const SIGNAL_URL = process.env.NEXT_PUBLIC_SIGNALING_URL || 'http://localhost:3001';

export default function Home() {
  const [screen, setScreen] = useState<Screen>('home');
  const [session, setSession] = useState<Session | null>(null);
  const [username, setUsername] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [customCode, setCustomCode] = useState('');
  const [marketTitle, setMarketTitle] = useState('');
  const [closesAt, setClosesAt] = useState('');
  const [scenarioLabels, setScenarioLabels] = useState(['', '']);
  const [market, setMarket] = useState<Market | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [selected, setSelected] = useState('');
  const [amount, setAmount] = useState(50);
  const [connection, setConnection] = useState<'connecting' | 'live' | 'offline'>('connecting');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const peersRef = useRef(new Map<string, RTCPeerConnection>());
  const channelsRef = useRef(new Map<string, RTCDataChannel>());
  const peerNamesRef = useRef(new Map<string, string>());
  const marketRef = useRef<Market | null>(null);
  const playersRef = useRef<Player[]>([]);
  const activityRef = useRef<ActivityItem[]>([]);
  const roleRef = useRef<'host' | 'guest'>('guest');
  const socketIdRef = useRef<string | null>(null);
  const usernameRef = useRef('');

  useEffect(() => { marketRef.current = market; }, [market]);
  useEffect(() => { playersRef.current = players; }, [players]);
  useEffect(() => { activityRef.current = activity; }, [activity]);
  useEffect(() => {
    if (session) {
      roleRef.current = session.role;
      usernameRef.current = session.username;
    }
  }, [session]);

  const broadcast = useCallback((nextMarket: Market, nextPlayers: Player[], nextActivity: ActivityItem[]) => {
    const payload: Snapshot = { type: 'snapshot', market: nextMarket, players: nextPlayers, activity: nextActivity };
    channelsRef.current.forEach((channel) => {
      if (channel.readyState === 'open') channel.send(JSON.stringify(payload));
    });
  }, []);

  const executeTrade = useCallback((name: string, outcomeId: string, tradeAmount: number) => {
    const currentMarket = marketRef.current;
    const currentPlayers = playersRef.current;
    const player = currentPlayers.find((item) => item.name === name);
    if (!currentMarket || currentMarket.status !== 'open' || Date.now() >= new Date(currentMarket.closesAt).getTime() || !player || tradeAmount <= 0 || player.balance < tradeAmount) return;
    const currentPrice = Math.max(.01, odds(currentMarket.outcomes, outcomeId) / 100);
    const shares = tradeAmount / currentPrice;
    const nextOutcomes = currentMarket.outcomes.map((item) => item.id === outcomeId ? { ...item, pool: item.pool + tradeAmount } : item);
    const point: Record<string, number | string> = { tick: `${currentMarket.history.length + 1}` };
    nextOutcomes.forEach((item) => { point[item.id] = odds(nextOutcomes, item.id); });
    const nextMarket = { ...currentMarket, outcomes: nextOutcomes, history: [...currentMarket.history, point].slice(-18) };
    const nextPlayers = currentPlayers.map((item) => item.name === name ? {
      ...item, balance: item.balance - tradeAmount,
      holdings: { ...item.holdings, [outcomeId]: (item.holdings[outcomeId] || 0) + shares },
      stakes: { ...item.stakes, [outcomeId]: (item.stakes[outcomeId] || 0) + tradeAmount },
    } : item);
    const label = nextOutcomes.find((item) => item.id === outcomeId)?.label;
    const nextActivity = [{ id: uid(), text: `${name} put $${tradeAmount} on ${label}`, time: now() }, ...activityRef.current].slice(0, 8);
    marketRef.current = nextMarket; playersRef.current = nextPlayers; activityRef.current = nextActivity;
    setMarket(nextMarket); setPlayers(nextPlayers); setActivity(nextActivity);
    broadcast(nextMarket, nextPlayers, nextActivity);
  }, [broadcast]);

  const closeBet = useCallback(() => {
    const currentMarket = marketRef.current;
    if (!currentMarket || currentMarket.status !== 'open') return;
    const nextMarket: Market = { ...currentMarket, status: 'closed' };
    const nextActivity = [{ id: uid(), text: 'Betting has closed', time: now() }, ...activityRef.current].slice(0, 8);
    marketRef.current = nextMarket; activityRef.current = nextActivity;
    setMarket(nextMarket); setActivity(nextActivity);
    broadcast(nextMarket, playersRef.current, nextActivity);
  }, [broadcast]);

  const resolveBet = useCallback((winnerId: string) => {
    const currentMarket = marketRef.current;
    if (!currentMarket || currentMarket.status !== 'closed') return;
    const totalPot = playersRef.current.reduce((sum, player) => sum + Object.values(player.stakes).reduce((a, b) => a + b, 0), 0);
    const winningPool = playersRef.current.reduce((sum, player) => sum + (player.stakes[winnerId] || 0), 0);
    const payouts: Payout[] = playersRef.current
      .filter((player) => (player.stakes[winnerId] || 0) > 0)
      .map((player) => {
        const stake = player.stakes[winnerId] || 0;
        const share = winningPool ? stake / winningPool : 0;
        const payout = share * totalPot;
        const totalInvested = Object.values(player.stakes).reduce((a, b) => a + b, 0);
        return { name: player.name, stake, share, payout, profit: payout - totalInvested };
      })
      .sort((a, b) => b.payout - a.payout);
    const nextPlayers = playersRef.current.map((player) => ({ ...player, balance: player.balance + (payouts.find((item) => item.name === player.name)?.payout || 0) }));
    const nextMarket: Market = { ...currentMarket, status: 'resolved', winnerId, payouts };
    const winner = currentMarket.outcomes.find((item) => item.id === winnerId)?.label || 'Winner';
    const nextActivity = [{ id: uid(), text: `${winner} won — payouts sent`, time: now() }, ...activityRef.current].slice(0, 8);
    marketRef.current = nextMarket; playersRef.current = nextPlayers; activityRef.current = nextActivity;
    setMarket(nextMarket); setPlayers(nextPlayers); setActivity(nextActivity);
    broadcast(nextMarket, nextPlayers, nextActivity);
  }, [broadcast]);

  useEffect(() => {
    if (session?.role !== 'host' || !market || market.status !== 'open') return;
    const remaining = new Date(market.closesAt).getTime() - Date.now();
    if (remaining <= 0) { closeBet(); return; }
    const timer = window.setTimeout(closeBet, remaining);
    return () => window.clearTimeout(timer);
  }, [closeBet, market, session?.role]);

  const setupChannel = useCallback((peerId: string, channel: RTCDataChannel) => {
    channelsRef.current.set(peerId, channel);
    channel.onopen = () => {
      setConnection('live');
      if (roleRef.current === 'host' && marketRef.current) broadcast(marketRef.current, playersRef.current, activityRef.current);
    };
    channel.onmessage = (event) => {
      const message = JSON.parse(event.data) as Snapshot | TradeMessage;
      if (message.type === 'snapshot' && roleRef.current === 'guest') {
        marketRef.current = message.market; playersRef.current = message.players; activityRef.current = message.activity;
        setMarket(message.market); setPlayers(message.players); setActivity(message.activity); setConnection('live');
      }
      if (message.type === 'trade' && roleRef.current === 'host') executeTrade(message.name, message.outcomeId, message.amount);
    };
    channel.onclose = () => { channelsRef.current.delete(peerId); if (roleRef.current === 'guest') setConnection('offline'); };
  }, [broadcast, executeTrade]);

  useEffect(() => {
    if (!session?.roomCode || !session.username) return;
    const roomCode = session.roomCode;
    const username = session.username;
    const initialRole = roleRef.current;
    const socket = io(SIGNAL_URL, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;
    const createPeer = (peerId: string, initiator: boolean) => {
      const existing = peersRef.current.get(peerId);
      if (existing) return existing;
      const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
      peersRef.current.set(peerId, pc);
      pc.onicecandidate = ({ candidate }) => { if (candidate) socket.emit('signal', { target: peerId, data: { candidate } }); };
      pc.onconnectionstatechange = () => { if (pc.connectionState === 'connected') setConnection('live'); };
      pc.ondatachannel = (event) => setupChannel(peerId, event.channel);
      if (initiator) setupChannel(peerId, pc.createDataChannel('master-better'));
      return pc;
    };
    const closePeer = (peerId: string) => {
      const pc = peersRef.current.get(peerId);
      if (pc) { pc.close(); peersRef.current.delete(peerId); }
      channelsRef.current.get(peerId)?.close();
      channelsRef.current.delete(peerId);
      peerNamesRef.current.delete(peerId);
    };
    socket.on('connect', () => {
      socketIdRef.current = socket.id ?? null;
      setConnection('connecting');
      // Only create/join with the role from when this socket effect mounted — role flips on handoff must not recreate the room.
      if (initialRole === 'host') socket.emit('create-room', { code: roomCode, name: username }, (reply: { ok: boolean; error?: string }) => {
        if (!reply.ok) { setError(reply.error || 'That bet code is already being used.'); setSession(null); setScreen('host'); }
      });
      else socket.emit('join-room', { code: roomCode, name: username }, (reply: { ok: boolean; error?: string }) => {
        if (!reply.ok) { setError(reply.error || 'Could not join that bet.'); setSession(null); setScreen('join'); }
      });
    });
    socket.on('peer-joined', async ({ peerId, name }: { peerId: string; name: string }) => {
      peerNamesRef.current.set(peerId, name);
      const nextPlayers = playersRef.current.some((item) => item.name === name) ? playersRef.current : [...playersRef.current, { name, balance: STARTING_BALANCE, holdings: {}, stakes: {} }];
      const nextActivity = [{ id: uid(), text: `${name} joined the bet`, time: now() }, ...activityRef.current].slice(0, 8);
      playersRef.current = nextPlayers; activityRef.current = nextActivity; setPlayers(nextPlayers); setActivity(nextActivity);
      const pc = createPeer(peerId, true);
      const offer = await pc.createOffer(); await pc.setLocalDescription(offer);
      socket.emit('signal', { target: peerId, data: { description: pc.localDescription } });
    });
    socket.on('signal', async ({ from, data }: { from: string; data: { description?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit } }) => {
      const pc = createPeer(from, false);
      if (data.description) {
        await pc.setRemoteDescription(data.description);
        if (data.description.type === 'offer') {
          const answer = await pc.createAnswer(); await pc.setLocalDescription(answer);
          socket.emit('signal', { target: from, data: { description: pc.localDescription } });
        }
      } else if (data.candidate) await pc.addIceCandidate(data.candidate);
    });
    socket.on('host-transferred', async ({ newHostId, previousHostId, members }: { newHostId: string; previousHostId: string; members: string[] }) => {
      peersRef.current.forEach((pc) => pc.close());
      peersRef.current.clear();
      channelsRef.current.forEach((ch) => { try { ch.close(); } catch { /* ignore */ } });
      channelsRef.current.clear();

      const prevName = peerNamesRef.current.get(previousHostId);
      peerNamesRef.current.delete(previousHostId);
      const selfId = socket.id || socketIdRef.current;
      const amNewHost = selfId === newHostId;
      const myName = usernameRef.current || username;

      let nextPlayers = [...playersRef.current];
      if (prevName) nextPlayers = nextPlayers.filter((p) => p.name !== prevName);
      else nextPlayers = nextPlayers.filter((p) => !p.host);
      nextPlayers = nextPlayers.map((p) => ({ ...p, host: amNewHost && p.name === myName }));
      playersRef.current = nextPlayers;
      setPlayers(nextPlayers);

      const nextActivity = [{ id: uid(), text: amNewHost ? 'You are now the host' : 'Host transferred to another player', time: now() }, ...activityRef.current].slice(0, 8);
      activityRef.current = nextActivity;
      setActivity(nextActivity);
      setConnection('connecting');

      if (amNewHost) {
        roleRef.current = 'host';
        setSession((s) => s ? { ...s, role: 'host' } : s);
        for (const memberId of members) {
          if (memberId === selfId) continue;
          const pc = createPeer(memberId, true);
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit('signal', { target: memberId, data: { description: pc.localDescription } });
        }
      } else {
        roleRef.current = 'guest';
        setSession((s) => s ? { ...s, role: 'guest' } : s);
      }
    });
    socket.on('peer-left', ({ peerId }: { peerId: string }) => {
      closePeer(peerId);
    });
    socket.on('room-closed', () => { setConnection('offline'); setError('The host closed this bet.'); });
    socket.on('connect_error', () => setConnection('offline'));
    return () => {
      peersRef.current.forEach((pc) => pc.close()); peersRef.current.clear(); channelsRef.current.clear();
      socketIdRef.current = null; socket.disconnect();
    };
  // Intentionally omit session.role — handoff updates role without remounting the socket.
  }, [session?.roomCode, session?.username, setupChannel]);

  const startHosting = (event: FormEvent) => {
    event.preventDefault(); setError('');
    const labels = scenarioLabels.map((item) => item.trim()).filter(Boolean);
    const normalizedCode = customCode.trim().toUpperCase();
    if (!username.trim() || !marketTitle.trim() || labels.length < 2 || !closesAt) { setError('Add your name, a question, a closing time, and at least two scenarios.'); return; }
    if (normalizedCode && !/^[A-Z0-9-]{4,12}$/.test(normalizedCode)) { setError('Your custom bet code must be 4–12 letters, numbers, or hyphens.'); return; }
    if (new Date(closesAt).getTime() <= Date.now()) { setError('Choose a closing time in the future.'); return; }
    const outcomes = labels.map((label, index) => ({ id: `outcome-${index}`, label, pool: 100, color: COLORS[index % COLORS.length] }));
    const firstPoint: Record<string, number | string> = { tick: 'Start' };
    outcomes.forEach((item) => { firstPoint[item.id] = Math.round(100 / outcomes.length); });
    const initialMarket: Market = { title: marketTitle.trim(), outcomes, history: [firstPoint], closesAt: new Date(closesAt).toISOString(), status: 'open' };
    const initialPlayers = [{ name: username.trim(), balance: STARTING_BALANCE, holdings: {}, stakes: {}, host: true }];
    const initialActivity = [{ id: uid(), text: `${username.trim()} opened the market`, time: now() }];
    marketRef.current = initialMarket; playersRef.current = initialPlayers; activityRef.current = initialActivity;
    setMarket(initialMarket); setPlayers(initialPlayers); setActivity(initialActivity);
    setSelected(outcomes[0].id); roleRef.current = 'host'; usernameRef.current = username.trim(); setSession({ role: 'host', roomCode: normalizedCode || betCode(), username: username.trim() }); setScreen('room');
  };

  const joinRoom = (event: FormEvent) => {
    event.preventDefault(); setError('');
    if (!username.trim() || joinCode.trim().length < 4) { setError('Enter your name and a valid bet code.'); return; }
    roleRef.current = 'guest'; usernameRef.current = username.trim(); setSession({ role: 'guest', roomCode: joinCode.trim().toUpperCase(), username: username.trim() }); setMarket(null); setScreen('room');
  };

  const placeTrade = () => {
    if (!session || !selected || amount <= 0 || marketRef.current?.status !== 'open') return;
    if (session.role === 'host') executeTrade(session.username, selected, amount);
    else {
      const channel = [...channelsRef.current.values()].find((item) => item.readyState === 'open');
      channel?.send(JSON.stringify({ type: 'trade', outcomeId: selected, amount, name: session.username } satisfies TradeMessage));
    }
  };

  const copyInvite = async () => {
    if (!session) return;
    const url = `${window.location.origin}?bet=${session.roomCode}`;
    await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1600);
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('bet') || params.get('room');
    if (code) { setJoinCode(code.toUpperCase()); setScreen('join'); }
  }, []);

  if (screen === 'room' && session) return <BetView session={session} market={market} players={players} activity={activity} connection={connection} selected={selected} setSelected={setSelected} amount={amount} setAmount={setAmount} placeTrade={placeTrade} resolveBet={resolveBet} copyInvite={copyInvite} copied={copied} leave={() => { setSession(null); setScreen('home'); }} error={error} />;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <Header />
      {screen === 'home' ? (
        <section className="mx-auto grid max-w-7xl gap-10 px-5 pb-16 pt-12 md:grid-cols-[1.05fr_.95fr] md:px-10 md:pt-24">
          <div className="max-w-2xl">
            <h1 className="font-heading text-5xl font-semibold leading-[.98] tracking-[-.055em] md:text-7xl">Turn friendly debates into live markets.</h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-muted-foreground md:text-lg">Create a private bet in seconds. Invite your people, trade with play money, and watch the crowd’s confidence move in real time.</p>
            <div className="mt-8 flex flex-wrap items-center gap-5 text-sm text-muted-foreground"><span className="flex items-center gap-2"><Users className="size-4 text-primary" /> No account needed</span><span className="flex items-center gap-2"><Radio className="size-4 text-primary" /> Live peer sync</span></div>
          </div>
          <div className="relative overflow-hidden rounded-[2rem] border border-border bg-card p-6 shadow-[0_30px_100px_-40px_rgba(20,32,31,.4)] md:p-8">
            <div className="pointer-events-none absolute -right-20 -top-24 size-64 rounded-full bg-primary/10 blur-3xl" />
            <p className="text-xs font-semibold uppercase tracking-[.16em] text-primary">Start predicting</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">Choose your side of the bet</h2>
            <div className="mt-7 grid gap-3">
              <Button onClick={() => setScreen('host')} className="h-auto justify-between rounded-2xl px-5 py-5 text-left" size="lg"><span><span className="block text-base">Host a prediction</span><span className="mt-1 block text-xs font-normal opacity-70">Create scenarios and invite your group</span></span><ArrowRight className="size-5" /></Button>
              <div className="flex items-center gap-3 py-1"><span className="h-px flex-1 bg-border" /><span className="text-[10px] font-semibold uppercase tracking-[.2em] text-muted-foreground">or join</span><span className="h-px flex-1 bg-border" /></div>
              <div className="grid grid-cols-[1fr_auto] gap-2"><Input value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} aria-label="Bet code" className="h-12 rounded-xl bg-background px-4 font-mono uppercase tracking-[.25em] placeholder:text-primary placeholder:opacity-100" placeholder="BET CODE" maxLength={12} /><Button onClick={() => setScreen('join')} variant="outline" className="h-12 rounded-xl px-5">Join bet</Button></div>
            </div>
            <p className="mt-6 text-center text-xs text-muted-foreground">Everyone starts with <strong className="font-semibold text-foreground">$100,000</strong> in play money.</p>
          </div>
        </section>
      ) : screen === 'host' ? (
        <HostForm username={username} setUsername={setUsername} marketTitle={marketTitle} setMarketTitle={setMarketTitle} customCode={customCode} setCustomCode={setCustomCode} closesAt={closesAt} setClosesAt={setClosesAt} labels={scenarioLabels} setLabels={setScenarioLabels} onSubmit={startHosting} error={error} back={() => setScreen('home')} />
      ) : (
        <JoinForm username={username} setUsername={setUsername} code={joinCode} setCode={setJoinCode} onSubmit={joinRoom} error={error} back={() => setScreen('home')} />
      )}
      {screen === 'home' && <section className="mt-4 border-t border-border/70 bg-card/50"><div className="mx-auto grid max-w-7xl gap-4 px-5 py-8 text-sm text-muted-foreground sm:grid-cols-3 md:px-10"><p><strong className="block text-foreground">01 · Create</strong> Add as many possible outcomes as you need.</p><p><strong className="block text-foreground">02 · Invite</strong> Share one custom bet code with friends.</p><p><strong className="block text-foreground">03 · Trade</strong> Buy positions and watch the odds respond.</p></div></section>}
    </main>
  );
}
