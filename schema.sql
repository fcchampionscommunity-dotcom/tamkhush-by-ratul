
-- ==========================================
-- TAMKHUSH BY RATUL
-- PREMIUM FASHION LABEL
-- DATABASE SCHEMA - VERSION 1.0
-- ==========================================

create extension if not exists pgcrypto;

-- 1. UPDATED AT FUNCTION
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 2. ADMIN / USER PROFILES
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  role text not null default 'customer'
    check (role in ('customer', 'owner', 'manager', 'admin')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Automatically create customer profile after signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', '')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- 3. STAFF CHECK FUNCTION
create or replace function public.is_staff()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
    and role in ('owner', 'manager', 'admin')
  );
$$;

-- 4. SUPPLIERS
create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  supplier_name text not null,
  contact_person text,
  phone text,
  email text,
  address text,
  notes text,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 5. PRODUCTS
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  category text not null
    check (category in ('men', 'women', 'unisex', 'accessories')),
  description text,
  selling_price numeric(12,2) not null default 0
    check (selling_price >= 0),
  supplier_cost numeric(12,2) default 0
    check (supplier_cost >= 0),
  stock integer default 0 check (stock >= 0),
  sizes text[] default '{}',
  colors text[] default '{}',
  images text[] default '{}',
  supplier_id uuid references public.suppliers(id)
    on delete set null,
  is_active boolean default true,
  is_featured boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 6. ORDERS
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text unique not null,
  customer_id uuid references public.profiles(id)
    on delete set null,
  customer_name text not null,
  customer_phone text not null,
  customer_email text,
  shipping_address text not null,
  city text,
  area text,
  postal_code text,
  subtotal numeric(12,2) not null default 0,
  delivery_charge numeric(12,2) not null default 0,
  discount numeric(12,2) not null default 0,
  total_amount numeric(12,2) not null default 0,
  payment_method text default 'cod'
    check (payment_method in ('cod', 'bkash', 'nagad', 'online')),
  payment_status text default 'pending'
    check (payment_status in ('pending', 'paid', 'failed', 'refunded')),
  order_status text default 'new'
    check (order_status in (
      'new', 'assigned', 'confirmed', 'processing',
      'shipped', 'delivered', 'completed',
      'cancelled', 'returned', 'refunded'
    )),
  supplier_order_id text,
  courier_name text,
  tracking_number text,
  assigned_admin uuid references public.profiles(id)
    on delete set null,
  customer_note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 7. ORDER ITEMS
create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id)
    on delete cascade,
  product_id uuid references public.products(id)
    on delete set null,
  product_name text not null,
  product_image text,
  selected_size text,
  selected_color text,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  supplier_cost numeric(12,2) default 0,
  created_at timestamptz default now()
);

-- 8. PAYMENTS
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id)
    on delete cascade,
  payment_method text not null,
  transaction_id text,
  amount numeric(12,2) not null,
  payment_status text default 'pending'
    check (payment_status in ('pending', 'paid', 'failed', 'refunded')),
  paid_at timestamptz,
  created_at timestamptz default now()
);

-- 9. ORDER STATUS HISTORY
create table if not exists public.order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id)
    on delete cascade,
  old_status text,
  new_status text not null,
  changed_by uuid references public.profiles(id)
    on delete set null,
  note text,
  created_at timestamptz default now()
);

-- 10. WEBSITE SETTINGS
create table if not exists public.site_settings (
  id uuid primary key default gen_random_uuid(),
  setting_key text unique not null,
  setting_value jsonb default '{}'::jsonb,
  updated_at timestamptz default now()
);

-- 11. UPDATED_AT TRIGGERS
drop trigger if exists products_updated_at on public.products;
create trigger products_updated_at
before update on public.products
for each row execute function public.set_updated_at();

drop trigger if exists orders_updated_at on public.orders;
create trigger orders_updated_at
before update on public.orders
for each row execute function public.set_updated_at();

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists suppliers_updated_at on public.suppliers;
create trigger suppliers_updated_at
before update on public.suppliers
for each row execute function public.set_updated_at();

-- 12. INDEXES
create index if not exists products_category_idx
on public.products(category);

create index if not exists products_active_idx
on public.products(is_active);

create index if not exists orders_customer_idx
on public.orders(customer_id);

create index if not exists orders_status_idx
on public.orders(order_status);

create index if not exists orders_created_idx
on public.orders(created_at desc);

create index if not exists order_items_order_idx
on public.order_items(order_id);

create index if not exists payments_order_idx
on public.payments(order_id);

-- 13. ENABLE ROW LEVEL SECURITY
alter table public.profiles enable row level security;
alter table public.suppliers enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payments enable row level security;
alter table public.order_status_history enable row level security;
alter table public.site_settings enable row level security;

-- 14. PROFILES POLICIES
drop policy if exists "Read own profile or staff" on public.profiles;
create policy "Read own profile or staff"
on public.profiles for select
to authenticated
using (id = auth.uid() or public.is_staff());

-- Staff can update profiles, but customers cannot change their role.
drop policy if exists "Staff update profiles" on public.profiles;
create policy "Staff update profiles"
on public.profiles for update
to authenticated
using (public.is_staff())
with check (public.is_staff());

-- 15. PRODUCTS POLICIES
drop policy if exists "Public read active products" on public.products;
create policy "Public read active products"
on public.products for select
to anon, authenticated
using (is_active = true or public.is_staff());

drop policy if exists "Staff insert products" on public.products;
create policy "Staff insert products"
on public.products for insert
to authenticated
with check (public.is_staff());

drop policy if exists "Staff update products" on public.products;
create policy "Staff update products"
on public.products for update
to authenticated
using (public.is_staff())
with check (public.is_staff());

drop policy if exists "Staff delete products" on public.products;
create policy "Staff delete products"
on public.products for delete
to authenticated
using (public.is_staff());

-- 16. SUPPLIERS POLICIES
drop policy if exists "Staff manage suppliers" on public.suppliers;
create policy "Staff manage suppliers"
on public.suppliers for all
to authenticated
using (public.is_staff())
with check (public.is_staff());

-- 17. ORDERS POLICIES
drop policy if exists "Customer read own orders" on public.orders;
create policy "Customer read own orders"
on public.orders for select
to authenticated
using (customer_id = auth.uid() or public.is_staff());

drop policy if exists "Staff insert orders" on public.orders;
create policy "Staff insert orders"
on public.orders for insert
to authenticated
with check (public.is_staff());

drop policy if exists "Staff update orders" on public.orders;
create policy "Staff update orders"
on public.orders for update
to authenticated
using (public.is_staff())
with check (public.is_staff());

-- 18. ORDER ITEMS POLICIES
drop policy if exists "Read own order items or staff" on public.order_items;
create policy "Read own order items or staff"
on public.order_items for select
to authenticated
using (
  public.is_staff()
  or exists (
    select 1 from public.orders
    where orders.id = order_items.order_id
    and orders.customer_id = auth.uid()
  )
);

drop policy if exists "Staff manage order items" on public.order_items;
create policy "Staff manage order items"
on public.order_items for all
to authenticated
using (public.is_staff())
with check (public.is_staff());

-- 19. PAYMENTS POLICIES
drop policy if exists "Read own payments or staff" on public.payments;
create policy "Read own payments or staff"
on public.payments for select
to authenticated
using (
  public.is_staff()
  or exists (
    select 1 from public.orders
    where orders.id = payments.order_id
    and orders.customer_id = auth.uid()
  )
);

drop policy if exists "Staff manage payments" on public.payments;
create policy "Staff manage payments"
on public.payments for all
to authenticated
using (public.is_staff())
with check (public.is_staff());

-- 20. ORDER STATUS HISTORY POLICIES
drop policy if exists "Read own order history or staff" on public.order_status_history;
create policy "Read own order history or staff"
on public.order_status_history for select
to authenticated
using (
  public.is_staff()
  or exists (
    select 1 from public.orders
    where orders.id = order_status_history.order_id
    and orders.customer_id = auth.uid()
  )
);

drop policy if exists "Staff manage order history" on public.order_status_history;
create policy "Staff manage order history"
on public.order_status_history for all
to authenticated
using (public.is_staff())
with check (public.is_staff());

-- 21. SITE SETTINGS POLICIES
drop policy if exists "Staff manage settings" on public.site_settings;
create policy "Staff manage settings"
on public.site_settings for all
to authenticated
using (public.is_staff())
with check (public.is_staff());

-- ==========================================
-- DATABASE SCHEMA COMPLETE
-- ==========================================
