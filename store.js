
/* =====================================
   TAMKHUSH BY RATUL
   PRODUCT DATABASE FUNCTIONS
===================================== */

// Supabase client comes from config.js
const store = {

  // 1. CUSTOMER WEBSITE: SHOW ACTIVE PRODUCTS
  async getProducts() {
    const { data, error } = await supabaseClient
      .from("products")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data;
  },

  // 2. ADMIN: GET ALL PRODUCTS
  async getAllProducts() {
    const { data, error } = await supabaseClient
      .from("products")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data;
  },

  // 3. ADMIN: ADD PRODUCT
  async addProduct(product) {
    const { data, error } = await supabaseClient
      .from("products")
      .insert([product])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // 4. ADMIN: UPDATE PRODUCT
  async updateProduct(id, updates) {
    const { data, error } = await supabaseClient
      .from("products")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // 5. ADMIN: DELETE PRODUCT
  async deleteProduct(id) {
    const { error } = await supabaseClient
      .from("products")
      .delete()
      .eq("id", id);

    if (error) throw error;
    return true;
  }

};

// Make functions available to other JS files
window.store = store;
