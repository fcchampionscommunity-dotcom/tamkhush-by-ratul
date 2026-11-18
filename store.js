
/* =====================================
   TAMKHUSH BY RATUL
   PRODUCT DATABASE FUNCTIONS
   IMPROVED LOADING + CACHE + RETRY
===================================== */

const PRODUCT_CACHE_KEY = "tkr_products_cache_v2";
const PRODUCT_CACHE_TIME = 3 * 60 * 1000;
const PRODUCT_RETRY_LIMIT = 3;

let productsRequest = null;

function getCachedProducts() {
  try {
    const cached = JSON.parse(
      localStorage.getItem(PRODUCT_CACHE_KEY) || "null"
    );

    if (!cached || !Array.isArray(cached.data)) {
      return null;
    }

    return cached;
  } catch (error) {
    return null;
  }
}

function saveProductsCache(data) {
  try {
    localStorage.setItem(
      PRODUCT_CACHE_KEY,
      JSON.stringify({
        data,
        updatedAt: Date.now()
      })
    );
  } catch (error) {
    console.warn("Product cache could not be saved:", error);
  }
}

function clearProductsCache() {
  try {
    localStorage.removeItem(PRODUCT_CACHE_KEY);
  } catch (error) {
    console.warn("Product cache could not be cleared:", error);
  }
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(requestFunction) {
  let lastError;

  for (let attempt = 1; attempt <= PRODUCT_RETRY_LIMIT; attempt++) {
    try {
      return await requestFunction();
    } catch (error) {
      lastError = error;

      if (attempt < PRODUCT_RETRY_LIMIT) {
        await wait(500 * Math.pow(2, attempt - 1));
      }
    }
  }

  throw lastError;
}

const store = {

  // CUSTOMER: ACTIVE PRODUCTS
  async getProducts(options = {}) {
    const forceRefresh = options.forceRefresh === true;

    if (productsRequest && !forceRefresh) {
      return productsRequest;
    }

    const cached = getCachedProducts();

    // Return fresh cache immediately
    if (
      !forceRefresh &&
      cached &&
      Date.now() - cached.updatedAt < PRODUCT_CACHE_TIME
    ) {
      return cached.data;
    }

    productsRequest = fetchWithRetry(async () => {
      if (!window.supabaseClient) {
        throw new Error("Supabase client is not available.");
      }

      const { data, error } = await window.supabaseClient
        .from("products")
        .select("*")
        .eq("is_active", true)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const products = data || [];

      saveProductsCache(products);

      return products;
    });

    try {
      return await productsRequest;
    } catch (error) {
      console.error("Product loading failed:", error);

      // Use previous successful products if network fails
      if (cached && Array.isArray(cached.data)) {
        console.warn("Using cached products as fallback.");
        return cached.data;
      }

      throw error;
    } finally {
      productsRequest = null;
    }
  },

  // CUSTOMER: GET ONE PRODUCT BY ID
  async getProductById(id) {
    if (!id) throw new Error("Product ID is required.");

    const cached = getCachedProducts();

    if (cached) {
      const found = cached.data.find(
        product => String(product.id) === String(id)
      );

      if (found) return found;
    }

    const { data, error } = await window.supabaseClient
      .from("products")
      .select("*")
      .eq("id", id)
      .eq("is_active", true)
      .maybeSingle();

    if (error) throw error;

    return data || null;
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

    clearProductsCache();

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

    clearProductsCache();

    return data;
  },

  // ADMIN: DELETE PRODUCT
  async deleteProduct(id) {
    const { error } = await window.supabaseClient
      .from("products")
      .delete()
      .eq("id", id);

    if (error) throw error;

    clearProductsCache();

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
  },

  // MANUALLY CLEAR CUSTOMER PRODUCT CACHE
  clearProductCache() {
    clearProductsCache();
    return true;
  }

};

window.store = store;
