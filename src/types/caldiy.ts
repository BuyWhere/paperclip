export interface CalDiyEventType {
  id: string;
  title: string;
  slug: string;
  description: string;
  length: number;
  schedulingUrl: string;
  customLink?: string;
  hashedLink?: string;
  type: 'instant' | 'reserved' | 'managed';
}

export interface CalDiyBooking {
  id: string;
  userId: string;
  eventTypeId: string;
  title: string;
  startTime: string;
  endTime: string;
  timeZone: string;
  status: 'cancelled' | 'pending' | 'accepted' | 'rejected';
  attendees: {
    email: string;
    name: string;
  }[];
}

export interface CalDiyUser {
  id: string;
  email: string;
  name: string;
  username: string;
  timeZone: string;
  locale: string;
}

export interface CalDiySchedule {
  id: string;
  name: string;
  availability: {
    startTime: string;
    endTime: string;
    days: number[];
  }[];
}
