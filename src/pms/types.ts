export type Property = { id: string; name: string; currency: string; tax_rate: number; check_in_time: string; check_out_time: string };
export type RoomType = { id: string; property_id: string; name: string; description: string; units: number; max_adults: number; sort: number };
export type RatePlan = { id: string; room_type_id: string; name: string; refundable: boolean; free_cancel_days: number; extra_adult_price: number };
export type Room = { id: string; room_type_id: string; name: string; housekeeping: 'clean' | 'dirty' | 'inspect' | 'out_of_order' };
export type Rate = { rate_plan_id: string; night: string; price: number; min_stay: number; stop_sell: boolean; closed_to_arrival: boolean; closed_to_departure: boolean };
export type Block = { id: string; room_type_id: string; date_from: string; date_to: string; units: number; reason: string };

export type Status = 'hold' | 'confirmed' | 'checked_in' | 'checked_out' | 'cancelled' | 'no_show' | 'expired';
export type Reservation = {
  id: string; code: string; property_id: string; status: Status; source: string; ota_reservation_id: string | null;
  check_in: string; check_out: string; adults: number; subtotal: number; tax: number; total: number; paid: number; currency: string;
  hold_expires_at: string | null; overbooked: boolean; notes: string; created_at: string;
  guest: { name: string; email: string | null; phone: string | null; country: string | null };
  room_type_id: string; rate_plan_id: string | null; room_id: string | null;
};

export type QuoteRow = {
  room_type_id: string; room_type_name: string; description: string; max_adults: number;
  rate_plan_id: string; rate_plan_name: string; refundable: boolean; free_cancel_days: number;
  available: number; nights: number; nightly: { night: string; price: number }[];
  subtotal: number; tax: number; total: number; currency: string; reason: string | null;
};

export type HoldInput = { property: string; ratePlan: string; checkIn: string; checkOut: string; adults: number; name: string; email: string; phone?: string; country?: string; notes?: string };
export type Hold = { reservation_id: string; code: string; total: number; hold_expires_at: string };

export type GridDay = { night: string; units: number; sold: number; blocked: number; available: number };
export type GridRate = { night: string; price: number | null; min_stay: number; stop_sell: boolean };
export type Grid = {
  nights: string[];
  roomTypes: { rt: RoomType; days: GridDay[]; plans: { plan: RatePlan; rates: GridRate[] }[] }[];
};

export type ChannelEvent = { id: number; at: string; direction: 'out' | 'in'; kind: string; ok: boolean; summary: string };

export interface PmsApi {
  mode: 'demo' | 'live';
  catalogue(): Promise<{ properties: Property[]; roomTypes: RoomType[]; ratePlans: RatePlan[] }>;
  quote(property: string, checkIn: string, checkOut: string, adults: number): Promise<QuoteRow[]>;
  createHold(input: HoldInput): Promise<Hold>;
  getBooking(code: string, email: string): Promise<{ code: string; status: Status; property: string; room: string; check_in: string; check_out: string; adults: number; total: number; paid: number; currency: string } | null>;
  // staff
  staffUser(): Promise<string | null>;
  staffSignIn(email: string): Promise<{ ok: boolean; message: string }>;
  staffSignOut(): Promise<void>;
  grid(property: string, from: string, days: number): Promise<Grid>;
  setRates(ratePlan: string, from: string, to: string, patch: { price?: number; min_stay?: number; stop_sell?: boolean }): Promise<void>;
  addBlock(roomType: string, from: string, to: string, units: number, reason: string): Promise<void>;
  reservations(property: string | null, from: string, to: string): Promise<Reservation[]>;
  rooms(property: string): Promise<Room[]>;
  setStatus(id: string, status: Status, roomId?: string | null): Promise<void>;
  staffConfirm(holdId: string, amount: number, method: string, source: string): Promise<void>;
  channelEvents(): Promise<ChannelEvent[]>;
  simulateOtaBooking?(property: string): Promise<Reservation>;
  demoPay?(reservationId: string): Promise<void>;
  reset?(): Promise<void>;
}
