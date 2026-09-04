export type Screen = 'home' | 'host' | 'join' | 'room';
export type Outcome = { id: string; label: string; pool: number; color: string };
export type Payout = { name: string; stake: number; share: number; payout: number; profit: number };
export type Market = {
  title: string;
  outcomes: Outcome[];
  history: Array<Record<string, number | string>>;
  closesAt: string;
  status: 'open' | 'closed' | 'resolved';
  winnerId?: string;
  payouts?: Payout[];
};
export type Player = { name: string; balance: number; holdings: Record<string, number>; stakes: Record<string, number>; host?: boolean };
export type ActivityItem = { id: string; text: string; time: string };
export type Snapshot = { type: 'snapshot'; market: Market; players: Player[]; activity: ActivityItem[] };
export type TradeMessage = { type: 'trade'; outcomeId: string; amount: number; name: string };
export type Session = { role: 'host' | 'guest'; roomCode: string; username: string };

export const COLORS = ['#28d17c', '#f05252', '#43a6f0', '#f1b94e', '#a77bf3', '#32c7c4'];
export const STARTING_BALANCE = 100000;

export function uid() { return Math.random().toString(36).slice(2, 10); }
export function betCode() { return Math.random().toString(36).slice(2, 8).toUpperCase(); }
export function odds(outcomes: Outcome[], id: string) {
  const total = outcomes.reduce((sum, item) => sum + item.pool, 0);
  return total ? Math.round((outcomes.find((item) => item.id === id)?.pool || 0) / total * 100) : 0;
}
export function now() { return new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
