
/* =====================================
   TAMKHUSH BY RATUL
   PRODUCT DATABASE FUNCTIONS
===================================== */

const store = {

  // CUSTOMER: ACTIVE PRODUCTS
  async getProducts() {
    const { data, error } = await window.supabaseClient
      .from("products")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data || [];
  },

  // ADMIN: ALL PRODUCTS
  async getAllProducts() {
    const { data, error } = await window.supabaseClient
      .from("products")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data || [];
  },

  // ADMIN: ADD PRODUCT
  async addProduct(product) {
    const { data, error } = await window.supabaseClient
      .from("products")
      .insert([product])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // ADMIN: UPDATE PRODUCT
  async updateProduct(id, updates) {
    const { data, error } = await window.supabaseClient
      .from("products")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // ADMIN: DELETE PRODUCT
  async deleteProduct(id) {
    const { error } = await window.supabaseClient
      .from("products")
      .delete()
      .eq("id", id);

    if (error) throw error;
    return true;
  },

  // ADMIN: GET LOW STOCK PRODUCTS
  async getLowStockProducts() {
    const { data, error } = await window.supabaseClient
      .from("products")
      .select("*")
      .eq("is_active", true)
      .eq("low_stock_alert", true);

    if (error) throw error;

    return (data || []).filter(product =>
      Number(product.stock || 0) <=
      Number(product.low_stock_threshold ?? 5)
    );
  }

};

window.store = store;
