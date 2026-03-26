export interface ShopmonkeyResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}

export interface PaginationParams {
  limit?: number;
  page?: number;
}

export interface Order {
  id: string;
  number?: number;
  status?: string;
  customerId?: string;
  vehicleId?: string;
  locationId?: string;
  createdDate?: string;
  updatedDate?: string;
  completedDate?: string;
  totalPrice?: number;
  [key: string]: unknown;
}

export interface Customer {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  [key: string]: unknown;
}

export interface Vehicle {
  id: string;
  customerId?: string;
  year?: number;
  make?: string;
  model?: string;
  vin?: string;
  licensePlate?: string;
  color?: string;
  mileage?: number;
  [key: string]: unknown;
}

export interface InventoryPart {
  id: string;
  name?: string;
  partNumber?: string;
  description?: string;
  quantity?: number;
  cost?: number;
  price?: number;
  [key: string]: unknown;
}

export interface InventoryTire {
  id: string;
  brand?: string;
  model?: string;
  size?: string;
  quantity?: number;
  cost?: number;
  price?: number;
  [key: string]: unknown;
}

export interface Appointment {
  id: string;
  customerId?: string;
  vehicleId?: string;
  orderId?: string;
  startDate?: string;
  endDate?: string;
  title?: string;
  notes?: string;
  [key: string]: unknown;
}

export interface Payment {
  id: string;
  orderId?: string;
  amount?: number;
  method?: string;
  status?: string;
  createdDate?: string;
  [key: string]: unknown;
}

export interface Labor {
  id: string;
  orderId?: string;
  technicianId?: string;
  description?: string;
  hours?: number;
  rate?: number;
  [key: string]: unknown;
}

export interface TimeclockEntry {
  id: string;
  userId?: string;
  clockIn?: string;
  clockOut?: string;
  [key: string]: unknown;
}

export interface User {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  role?: string;
  [key: string]: unknown;
}

export interface Service {
  id: string;
  orderId?: string;
  name?: string;
  description?: string;
  price?: number;
  [key: string]: unknown;
}

export interface CannedService {
  id: string;
  name?: string;
  description?: string;
  price?: number;
  laborHours?: number;
  [key: string]: unknown;
}

export interface WorkflowStatus {
  id: string;
  name?: string;
  order?: number;
  [key: string]: unknown;
}

export interface Location {
  id: string;
  name?: string;
  address?: string;
  phone?: string;
  [key: string]: unknown;
}
