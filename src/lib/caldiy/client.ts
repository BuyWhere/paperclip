import type { CalDiyBooking, CalDiyEventType, CalDiyUser, CalDiySchedule } from '@/types/caldiy';

const CALDIY_URL = process.env.NEXT_PUBLIC_CALDIY_URL || process.env.NEXT_PUBLIC_API_URL || '';
const API_KEY = process.env.CALDIY_API_KEY || '';

class CalDiyApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public endpoint: string
  ) {
    super(message);
    this.name = 'CalDiyApiError';
  }
}

async function fetchCalDiy<T>(endpoint: string, options?: RequestInit): Promise<T> {
  if (!CALDIY_URL) {
    throw new CalDiyApiError('Cal.diy URL not configured', 500, endpoint);
  }

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options?.headers,
  };

  if (API_KEY) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${API_KEY}`;
  }

  const response = await fetch(`${CALDIY_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new CalDiyApiError(
      `Cal.diy API error: ${response.status} ${response.statusText} - ${errorText}`,
      response.status,
      endpoint
    );
  }

  return response.json();
}

export const caldiyApi = {
  eventTypes: {
    list: (): Promise<{ eventTypes: CalDiyEventType[] }> =>
      fetchCalDiy('/api/v2/event-types'),

    get: (id: string): Promise<CalDiyEventType> =>
      fetchCalDiy(`/api/v2/event-types/${id}`),
  },

  bookings: {
    list: (params?: { status?: string; limit?: number }): Promise<{ bookings: CalDiyBooking[] }> => {
      const searchParams = new URLSearchParams();
      if (params?.status) searchParams.set('status', params.status);
      if (params?.limit) searchParams.set('limit', String(params.limit));
      const query = searchParams.toString();
      return fetchCalDiy(`/api/v2/bookings${query ? `?${query}` : ''}`);
    },

    get: (id: string): Promise<CalDiyBooking> =>
      fetchCalDiy(`/api/v2/bookings/${id}`),
  },

  users: {
    me: (): Promise<CalDiyUser> =>
      fetchCalDiy('/api/v2/users/me'),

    get: (id: string): Promise<CalDiyUser> =>
      fetchCalDiy(`/api/v2/users/${id}`),
  },

  schedules: {
    list: (): Promise<{ schedules: CalDiySchedule[] }> =>
      fetchCalDiy('/api/v2/schedules'),

    get: (id: string): Promise<CalDiySchedule> =>
      fetchCalDiy(`/api/v2/schedules/${id}`),
  },
};

export { CALDIY_URL, CalDiyApiError };
