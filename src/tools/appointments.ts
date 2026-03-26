import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { shopmonkeyRequest, sanitizePathParam } from '../client.js';
import type { Appointment } from '../types/shopmonkey.js';

export const definitions: Tool[] = [
  {
    name: 'list_appointments',
    description: 'List appointments from Shopmonkey. Supports filtering and pagination.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        customerId: { type: 'string', description: 'Filter appointments by customer ID' },
        locationId: { type: 'string', description: 'Filter by location ID' },
        startDate: { type: 'string', description: 'Filter by start date (ISO 8601 format)' },
        endDate: { type: 'string', description: 'Filter by end date (ISO 8601 format)' },
        limit: { type: 'number', description: 'Maximum number of results to return (default: 25)' },
        page: { type: 'number', description: 'Page number for pagination (default: 1)' },
      },
    },
  },
  {
    name: 'get_appointment',
    description: 'Get detailed information about a single appointment by its ID.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'The appointment ID' },
      },
      required: ['id'],
    },
  },
  {
    name: 'create_appointment',
    description: 'Book a new appointment in Shopmonkey.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        customerId: { type: 'string', description: 'Customer ID for the appointment' },
        vehicleId: { type: 'string', description: 'Vehicle ID for the appointment' },
        orderId: { type: 'string', description: 'Work order ID to link to' },
        startDate: { type: 'string', description: 'Appointment start date/time (ISO 8601 format)' },
        endDate: { type: 'string', description: 'Appointment end date/time (ISO 8601 format)' },
        title: { type: 'string', description: 'Appointment title or summary' },
        notes: { type: 'string', description: 'Additional notes for the appointment' },
        locationId: { type: 'string', description: 'Location ID for multi-location shops' },
      },
    },
  },
  {
    name: 'update_appointment',
    description: 'Update or reschedule an existing appointment.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'The appointment ID to update' },
        customerId: { type: 'string', description: 'Customer ID for the appointment' },
        vehicleId: { type: 'string', description: 'Vehicle ID for the appointment' },
        orderId: { type: 'string', description: 'Work order ID to link to' },
        startDate: { type: 'string', description: 'New start date/time (ISO 8601 format)' },
        endDate: { type: 'string', description: 'New end date/time (ISO 8601 format)' },
        title: { type: 'string', description: 'Appointment title or summary' },
        notes: { type: 'string', description: 'Additional notes' },
      },
      required: ['id'],
    },
  },
];

const ALLOWED_FIELDS = ['customerId', 'vehicleId', 'orderId', 'startDate', 'endDate', 'title', 'notes', 'locationId'];

function pickFields(args: Record<string, unknown>, allowed: string[]): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const key of allowed) {
    if (args[key] !== undefined) body[key] = args[key];
  }
  return body;
}

export const handlers: Record<string, (args: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>> = {
  async list_appointments(args) {
    const params: Record<string, string> = {};
    if (args.customerId !== undefined) params.customerId = String(args.customerId);
    if (args.locationId !== undefined) params.locationId = String(args.locationId);
    if (args.startDate !== undefined) params.startDate = String(args.startDate);
    if (args.endDate !== undefined) params.endDate = String(args.endDate);
    if (args.limit !== undefined) params.limit = String(args.limit);
    if (args.page !== undefined) params.page = String(args.page);

    const data = await shopmonkeyRequest<Appointment[]>('GET', '/appointment', undefined, params);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },

  async get_appointment(args) {
    if (!args.id) return { content: [{ type: 'text', text: 'Error: id is required' }], isError: true };
    const data = await shopmonkeyRequest<Appointment>('GET', `/appointment/${sanitizePathParam(String(args.id))}`);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },

  async create_appointment(args) {
    const body = pickFields(args, ALLOWED_FIELDS);
    const data = await shopmonkeyRequest<Appointment>('POST', '/appointment', body);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },

  async update_appointment(args) {
    if (!args.id) return { content: [{ type: 'text', text: 'Error: id is required' }], isError: true };
    const body = pickFields(args, ALLOWED_FIELDS.filter(f => f !== 'locationId'));
    const data = await shopmonkeyRequest<Appointment>('PATCH', `/appointment/${sanitizePathParam(String(args.id))}`, body);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },
};
