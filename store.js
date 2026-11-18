
/* =====================================
   TAMKHUSH BY RATUL
   PRODUCT DATABASE FUNCTIONS
   PRODUCT VARIATIONS + CACHE + RETRY
===================================== */

const PRODUCT_CACHE_KEY = "tkr_products_cache_v3";
const PRODUCT_CACHE_TIME = 3 * 60 * 1000;
const PRODUCT_RETRY_LIMIT = 3;

let productsRequest = null;

function getCachedProducts() {
  try {
    const cached = JSON.parse(
      localStorage.getItem(PRODUCT_CACHE_KEY) || "null"
    );
    return cached && Array.isArray(cached.data) ? cached : null;
  } catch (error) {
    return null;
  }
}

function saveProductsCache(data) {
  try {
    localStorage.setItem(PRODUCT_CACHE_KEY, JSON.stringify({
      data,
      updatedAt: Date.now()
    }));
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

function normalizeVariations(data) {
  return (data || []).map(item => ({
    id: item.id,
    product_id: item.product_id,
    color_name: item.color_name || "",
    supplier_sku: item.supplier_sku || "",
    supplier_product_url: item.supplier_product_url || "",
    image_url: item.image_url || "",
    sort_order: Number(item.sort_order || 0)
  }));
}

const store = {

  // CUSTOMER: ACTIVE PRODUCTS
  async getProducts(options = {}) {
    const forceRefresh = options.forceRefresh === true;

    if (productsRequest && !forceRefresh) return productsRequest;

    const cached = getCachedProducts();

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

      if (products.length) {
        const ids = products.map(p => p.id);

        const { data: variations, error: variationError } =
          await window.supabaseClient
            .from("product_variations")
            .select("*")
            .in("product_id", ids)
            .order("sort_order", { ascending: true });

        if (variationError) throw variationError;

        const grouped = {};
        normalizeVariations(variations).forEach(v => {
          if (!grouped[v.product_id]) grouped[v.product_id] = [];
          grouped[v.product_id].push(v);
        });

        products.forEach(p => {
          p.variations = grouped[p.id] || [];
        });
      }

      saveProductsCache(products);
      return products;
    });

    try {
      return await productsRequest;
    } catch (error) {
      console.error("Product loading failed:", error);

      if (cached && Array.isArray(cached.data)) {
        return cached.data;
      }

      throw error;
    } finally {
      productsRequest = null;
    }
  },

  // CUSTOMER: GET ONE PRODUCT
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
    if (!data) return null;

    data.variations = await this.getProductVariations(id);
    return data;
  },

  // ADMIN: ALL PRODUCTS
  async getAllProducts() {
    const { data, error } = await window.supabaseClient
      .from("products")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    const products = data || [];

    if (products.length) {
      const ids = products.map(p => p.id);

      const { data: variations, error: variationError } =
        await window.supabaseClient
          .from("product_variations")
          .select("*")
          .in("product_id", ids)
          .order("sort_order", { ascending: true });

      if (variationError) throw variationError;

      const grouped = {};
      normalizeVariations(variations).forEach(v => {
        if (!grouped[v.product_id]) grouped[v.product_id] = [];
        grouped[v.product_id].push(v);
      });

      products.forEach(p => {
        p.variations = grouped[p.id] || [];
      });
    }

    return products;
  },

  // VARIATIONS: GET ALL FOR ONE PRODUCT
  async getProductVariations(productId) {
    if (!productId) throw new Error("Product ID is required.");

    const { data, error } = await window.supabaseClient
      .from("product_variations")
      .select("*")
      .eq("product_id", productId)
      .order("sort_order", { ascending: true });

    if (error) throw error;
    return normalizeVariations(data);
  },

  // VARIATIONS: SAVE / UPDATE
  async saveProductVariations(productId, variations) {
    if (!productId) throw new Error("Product ID is required.");
    if (!Array.isArray(variations)) {
      throw new Error("Variations must be an array.");
    }

    const cleaned = variations.map((v, index) => ({
      ...(v.id ? { id: v.id } : {}),
      product_id: productId,
      color_name: String(v.color_name || "").trim(),
      supplier_sku: String(v.supplier_sku || "").trim() || null,
      supplier_product_url:
        String(v.supplier_product_url || "").trim() || null,
      image_url: String(v.image_url || "").trim() || null,
      sort_order: index
    }));

    if (cleaned.some(v => !v.color_name)) {
      throw new Error("প্রতিটি Variation-এর Color Name দিতে হবে।");
    }

    const { data: existing, error: existingError } =
      await window.supabaseClient
        .from("product_variations")
        .select("id")
        .eq("product_id", productId);

    if (existingError) throw existingError;

    if (cleaned.length) {
      const { error: saveError } = await window.supabaseClient
        .from("product_variations")
        .upsert(cleaned, { onConflict: "id" });

      if (saveError) throw saveError;
    }

    const keepIds = cleaned.filter(v => v.id).map(v => v.id);
    const removeIds = (existing || [])
      .map(v => v.id)
      .filter(id => !keepIds.includes(id));

    if (removeIds.length) {
      const { error: deleteError } = await window.supabaseClient
        .from("product_variations")
        .delete()
        .eq("product_id", productId)
        .in("id", removeIds);

      if (deleteError) throw deleteError;
    }

    clearProductsCache();
    return await this.getProductVariations(productId);
  },

  // VARIATIONS: DELETE ONE
  async deleteProductVariation(variationId) {
    if (!variationId) throw new Error("Variation ID is required.");

    const { error } = await window.supabaseClient
      .from("product_variations")
      .delete()
      .eq("id", variationId);

    if (error) throw error;

    clearProductsCache();
    return true;
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

  // ADMIN: LOW STOCK PRODUCTS
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

  // CLEAR CUSTOMER CACHE
  clearProductCache() {
    clearProductsCache();
    return true;
  }

};

window.store = store;
