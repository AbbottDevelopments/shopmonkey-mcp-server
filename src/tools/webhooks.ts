// This module enables Section 2 of the client brief: registering Make.com endpoints for
// GoHighLevel 2-way sync via Shopmonkey webhooks. Expose this module to let Claude manage
// webhook registrations through natural language.
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { shopmonkeyRequest, sanitizePathParam } from '../client.js';
import type { Webhook } from '../types/shopmonkey.js';
import type { ToolHandlerMap } from '../types/tools.js';
import { pickFields } from '../types/tools.js';

const TRIGGER_ENUM = [
  'Appointment', 'Customer', 'Inspection', 'Inventory', 'Message',
  'Order', 'Payment', 'PurchaseOrder', 'User', 'Vehicle', 'Vendor',
] as const;

const WEBHOOK_FIELDS = ['name', 'url', 'triggers', 'enabled', 'secret', 'version'];

export const definitions: Tool[] = [
  {
    name: 'list_webhooks',
    description: 'List all registered webhooks in Shopmonkey.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        limit: { type: 'number', description: 'Maximum number of results to return (default: 25)' },
        page: { type: 'number', description: 'Page number for pagination (default: 1)' },
      },
    },
  },
  {
    name: 'get_webhook',
    description: 'Get details of a single webhook by ID.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'The webhook ID' },
      },
      required: ['id'],
    },
  },
  {
    name: 'create_webhook',
    description: 'Create a new webhook in Shopmonkey. Use this to register Make.com or other endpoint URLs that receive Shopmonkey event notifications.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Descriptive name for this webhook (e.g., "make-ghl-sync")' },
        url: { type: 'string', description: 'The HTTPS endpoint URL that will receive webhook events' },
        triggers: {
          type: 'array',
          description: 'List of event types that trigger this webhook',
          items: {
            type: 'string',
            enum: TRIGGER_ENUM,
          },
        },
        enabled: { type: 'boolean', description: 'Whether the webhook is active (default: true)' },
        secret: { type: 'string', description: 'Optional shared secret for HMAC signature verification' },
        version: { type: 'number', description: 'Webhook payload version' },
      },
      required: ['name', 'url', 'triggers'],
    },
  },
  {
    name: 'update_webhook',
    description: 'Update an existing webhook by ID.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'The webhook ID to update' },
        name: { type: 'string', description: 'Updated name' },
        url: { type: 'string', description: 'Updated endpoint URL' },
        triggers: {
          type: 'array',
          description: 'Updated list of trigger event types',
          items: {
            type: 'string',
            enum: TRIGGER_ENUM,
          },
        },
        enabled: { type: 'boolean', description: 'Enable or disable the webhook' },
        secret: { type: 'string', description: 'Updated shared secret' },
        version: { type: 'number', description: 'Updated payload version' },
      },
      required: ['id'],
    },
  },
  {
    name: 'delete_webhook',
    description: 'Delete a webhook by ID.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'The webhook ID to delete' },
      },
      required: ['id'],
    },
  },
];

export const handlers: ToolHandlerMap = {
  async list_webhooks(args) {
    const params: Record<string, string> = {};
    if (args.limit !== undefined) params.limit = String(args.limit);
    if (args.page !== undefined) params.page = String(args.page);
    const data = await shopmonkeyRequest<Webhook[]>('GET', '/webhook', undefined, params);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },

  async get_webhook(args) {
    if (!args.id) return { content: [{ type: 'text', text: 'Error: id is required' }], isError: true };
    const data = await shopmonkeyRequest<Webhook>('GET', `/webhook/${sanitizePathParam(String(args.id))}`);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },

  async create_webhook(args) {
    if (!args.name) return { content: [{ type: 'text', text: 'Error: name is required' }], isError: true };
    if (!args.url) return { content: [{ type: 'text', text: 'Error: url is required' }], isError: true };
    if (!args.triggers) return { content: [{ type: 'text', text: 'Error: triggers is required' }], isError: true };
    const body = pickFields(args, WEBHOOK_FIELDS);
    const data = await shopmonkeyRequest<Webhook>('POST', '/webhook', body);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },

  async update_webhook(args) {
    if (!args.id) return { content: [{ type: 'text', text: 'Error: id is required' }], isError: true };
    const body = pickFields(args, WEBHOOK_FIELDS);
    const data = await shopmonkeyRequest<Webhook>('PUT', `/webhook/${sanitizePathParam(String(args.id))}`, body);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },

  async delete_webhook(args) {
    if (!args.id) return { content: [{ type: 'text', text: 'Error: id is required' }], isError: true };
    await shopmonkeyRequest<void>('DELETE', `/webhook/${sanitizePathParam(String(args.id))}`);
    return { content: [{ type: 'text', text: `Webhook ${String(args.id)} deleted successfully` }] };
  },
};
