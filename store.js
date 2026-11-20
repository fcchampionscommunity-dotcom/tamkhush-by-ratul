
/* =====================================
   TAMKHUSH BY RATUL
   PRODUCT DATABASE FUNCTIONS
   CUSTOMER-SAFE PRODUCT FETCH
   SHARED SIZES + COLOR VARIATIONS
   CACHE + RETRY
===================================== */

const PRODUCT_CACHE_KEY = "tkr_products_cache_v5";
const PRODUCT_CACHE_TIME = 3 * 60 * 1000;
const PRODUCT_RETRY_LIMIT = 3;

let productsRequest = null;

const PUBLIC_PRODUCT_COLUMNS = [
  "id", "name", "slug", "category", "description",
  "selling_price", "discount_price", "stock", "sizes",
  "colors", "images", "is_active", "is_featured",
  "created_at", "updated_at", "sku",
  "is_new_arrival", "is_best_seller",
  "low_stock_alert", "low_stock_threshold", "maximum_discount"
].join(",");

const PUBLIC_VARIATION_COLUMNS = [
  "id", "product_id", "color", "color_name",
  "image_url", "images", "sort_order"
].join(",");

function getSupabaseClient() {
  if (!window.supabaseClient) {
    throw new Error("Supabase client is not available.");
  }
  return window.supabaseClient;
}

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
    localStorage.removeItem("tkr_products_cache_v4");
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

function normalizeSizes(sizes) {
  if (!Array.isArray(sizes)) return [];

  return [...new Set(
    sizes
      .map(size => String(size || "").trim())
      .filter(Boolean)
  )];
}

function normalizeProduct(product) {
  if (!product) return product;

  return {
    ...product,
    sizes: normalizeSizes(product.sizes),
    colors: Array.isArray(product.colors) ? product.colors : [],
    images: Array.isArray(product.images) ? product.images : [],
    variations: Array.isArray(product.variations)
      ? product.variations
      : []
  };
}

// Admin variation normalizer.
function normalizeVariations(data) {
  return (data || []).map(item => ({
    id: item.id,
    product_id: item.product_id,
    color: item.color || item.color_name || "",
    color_name: item.color_name || item.color || "",
    sku: item.sku || "",
    supplier_sku: item.sku || "",
    supplier_order_id: item.supplier_order_id || "",
    supplier_product_url: item.supplier_product_url || "",
    supplier_cost: item.supplier_cost == null
      ? 0
      : Number(item.supplier_cost),
    dropbazar_product_id: item.dropbazar_product_id || "",
    image_url: item.image_url || "",
    images: Array.isArray(item.images) ? item.images : [],
    sort_order: Number(item.sort_order || 0)
  }));
}

function groupVariationsByProduct(products, variations) {
  const grouped = {};

  normalizeVariations(variations).forEach(variation => {
    if (!grouped[variation.product_id]) {
      grouped[variation.product_id] = [];
    }
    grouped[variation.product_id].push(variation);
  });

  return (products || []).map(product => ({
    ...normalizeProduct(product),
    variations: grouped[product.id] || []
  }));
}

// Customer-safe variation normalizer.
function normalizePublicVariations(data) {
  return (data || []).map(item => ({
    id: item.id,
    product_id: item.product_id,
    color: item.color || item.color_name || "",
    color_name: item.color_name || item.color || "",
    image_url: item.image_url || "",
    images: Array.isArray(item.images) ? item.images : [],
    sort_order: Number(item.sort_order || 0)
  }));
}

const store = {

  // CUSTOMER: ACTIVE PRODUCTS
  async getProducts(options = {}) {
    const forceRefresh = options.forceRefresh === true;

    if (productsRequest && !forceRefresh) {
      return productsRequest;
    }

    const cached = getCachedProducts();

    if (
      !forceRefresh &&
      cached &&
      Date.now() - cached.updatedAt < PRODUCT_CACHE_TIME
    ) {
      return cached.data;
    }

    productsRequest = (async () => {
      const client = getSupabaseClient();

      const products = await fetchWithRetry(async () => {
        const { data, error } = await client
          .from("products")
          .select(PUBLIC_PRODUCT_COLUMNS)
          .eq("is_active", true)
          .order("created_at", { ascending: false });

        if (error) throw error;
        return (data || []).map(normalizeProduct);
      });

      if (!products.length) {
        saveProductsCache([]);
        return [];
      }

      const ids = products.map(product => product.id).filter(Boolean);
      let variations = [];

      // Variation failure will not hide the products.
      try {
        const result = await fetchWithRetry(async () => {
          const response = await client
            .from("product_variations")
            .select(PUBLIC_VARIATION_COLUMNS)
            .in("product_id", ids)
            .order("sort_order", { ascending: true });

          if (response.error) throw response.error;
          return response;
        });

        variations = normalizePublicVariations(result.data);
      } catch (variationError) {
        console.warn(
          "Variations could not be loaded. Products will still display:",
          variationError
        );
      }

      const grouped = {};

      variations.forEach(variation => {
        if (!grouped[variation.product_id]) {
          grouped[variation.product_id] = [];
        }
        grouped[variation.product_id].push(variation);
      });

      const result = products.map(product => ({
        ...product,
        variations: grouped[product.id] || []
      }));

      saveProductsCache(result);
      return result;
    })();

    try {
      return await productsRequest;
    } catch (error) {
      console.error("Product loading failed:", error);

      if (cached && Array.isArray(cached.data)) {
        console.warn("Showing previously cached products.");
        return cached.data;
      }

      throw error;
    } finally {
      productsRequest = null;
    }
  },

  // CUSTOMER: GET ONE ACTIVE PRODUCT
  async getProductById(id) {
    if (!id) {
      throw new Error("Product ID is required.");
    }

    const cached = getCachedProducts();

    if (cached) {
      const found = cached.data.find(
        product => String(product.id) === String(id)
      );
      if (found) return normalizeProduct(found);
    }

    const client = getSupabaseClient();

    const { data, error } = await client
      .from("products")
      .select(PUBLIC_PRODUCT_COLUMNS)
      .eq("id", id)
      .eq("is_active", true)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    const product = normalizeProduct(data);

    try {
      product.variations = await this.getProductVariations(id);
    } catch (variationError) {
      console.warn("Product detail variations could not be loaded:", variationError);
      product.variations = [];
    }

    return product;
  },

  // ADMIN: ALL PRODUCTS WITH SUPPLIER DATA
  async getAllProducts() {
    const client = getSupabaseClient();

    const { data, error } = await client
      .from("products")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    const products = data || [];
    if (!products.length) return [];

    const ids = products.map(product => product.id);

    const { data: variations, error: variationError } = await client
      .from("product_variations")
      .select("*")
      .in("product_id", ids)
      .order("sort_order", { ascending: true });

    if (variationError) throw variationError;

    return groupVariationsByProduct(products, variations);
  },

  // CUSTOMER: SAFE VARIATION DATA ONLY
  async getProductVariations(productId) {
    if (!productId) {
      throw new Error("Product ID is required.");
    }

    const client = getSupabaseClient();

    const { data, error } = await client
      .from("product_variations")
      .select(PUBLIC_VARIATION_COLUMNS)
      .eq("product_id", productId)
      .order("sort_order", { ascending: true });

    if (error) throw error;

    return normalizePublicVariations(data);
  },

  // ADMIN: GET VARIATIONS WITH SUPPLIER FIELDS
  async getAdminProductVariations(productId) {
    if (!productId) {
      throw new Error("Product ID is required.");
    }

    const client = getSupabaseClient();

    const { data, error } = await client
      .from("product_variations")
      .select("*")
      .eq("product_id", productId)
      .order("sort_order", { ascending: true });

    if (error) throw error;

    return normalizeVariations(data);
  },

  // NORMALIZE SHARED PRODUCT SIZES
  normalizeProductSizes(sizes) {
    return normalizeSizes(sizes);
  },

  // SAVE SHARED PRODUCT SIZES
  async saveProductSizes(productId, sizes) {
    if (!productId) {
      throw new Error("Product ID is required.");
    }

    const client = getSupabaseClient();

    const { data, error } = await client
      .from("products")
      .update({
        sizes: normalizeSizes(sizes)
      })
      .eq("id", productId)
      .select()
      .single();

    if (error) throw error;

    clearProductsCache();
    return normalizeProduct(data);
  },

  // ADMIN: SAVE / UPDATE COLOR VARIATIONS
  async saveProductVariations(productId, variations) {
    if (!productId) {
      throw new Error("Product ID is required.");
    }

    if (!Array.isArray(variations)) {
      throw new Error("Variations must be an array.");
    }

    const client = getSupabaseClient();

    const cleaned = variations.map((variation, index) => {
      const color = String(
        variation.color || variation.color_name || ""
      ).trim();

      const sku = String(
        variation.sku || variation.supplier_sku || ""
      ).trim();

      const images = Array.isArray(variation.images)
        ? variation.images
            .map(image => String(image || "").trim())
            .filter(Boolean)
        : [];

      const imageUrl = String(
        variation.image_url || images[0] || ""
      ).trim();

      const supplierCost =
        variation.supplier_cost === "" ||
        variation.supplier_cost == null
          ? 0
          : Number(variation.supplier_cost);

      if (!Number.isFinite(supplierCost) || supplierCost < 0) {
        throw new Error(
          "Supplier Cost অবশ্যই সঠিক শূন্য বা ধনাত্মক সংখ্যা হতে হবে।"
        );
      }

      return {
        ...(variation.id ? { id: variation.id } : {}),
        product_id: productId,
        color,
        color_name: color,
        sku: sku || null,
        supplier_product_url:
          String(variation.supplier_product_url || "").trim() || null,
        supplier_order_id:
          String(variation.supplier_order_id || "").trim() || null,
        supplier_cost: supplierCost,
        dropbazar_product_id:
          String(variation.dropbazar_product_id || "").trim() || null,
        image_url: imageUrl || null,
        images,
        sort_order: Number.isFinite(Number(variation.sort_order))
          ? Number(variation.sort_order)
          : index
      };
    });

    if (cleaned.some(variation => !variation.color)) {
      throw new Error(
        "প্রতিটি Color Variation-এর Color Name দিতে হবে।"
      );
    }

    // Verify existing IDs belong to this product.
    const existingIds = cleaned
      .filter(variation => variation.id)
      .map(variation => variation.id);

    if (existingIds.length) {
      const { data: existing, error: existingError } = await client
        .from("product_variations")
        .select("id")
        .eq("product_id", productId)
        .in("id", existingIds);

      if (existingError) throw existingError;

      const validIds = new Set(
        (existing || []).map(item => item.id)
      );

      if (existingIds.some(id => !validIds.has(id))) {
        throw new Error(
          "একটি Variation এই Product-এর অন্তর্ভুক্ত নয়।"
        );
      }
    }

    // Update existing variations.
    const updates = cleaned.filter(variation => variation.id);

    if (updates.length) {
      const { error: updateError } = await client
        .from("product_variations")
        .upsert(updates, { onConflict: "id" });

      if (updateError) throw updateError;
    }

    // Insert new variations.
    const inserts = cleaned.filter(variation => !variation.id);

    if (inserts.length) {
      const { error: insertError } = await client
        .from("product_variations")
        .insert(inserts);

      if (insertError) throw insertError;
    }

    // Omitted variations are not automatically deleted.
    clearProductsCache();

    return await this.getAdminProductVariations(productId);
  },

  // DELETE ONE VARIATION EXPLICITLY
  async deleteProductVariation(variationId) {
    if (!variationId) {
      throw new Error("Variation ID is required.");
    }

    const client = getSupabaseClient();

    const { error } = await client
      .from("product_variations")
      .delete()
      .eq("id", variationId);

    if (error) throw error;

    clearProductsCache();
    return true;
  },

  // ADMIN: ADD PRODUCT
  async addProduct(product) {
    const client = getSupabaseClient();

    const cleanedProduct = {
      ...product,
      sizes: normalizeSizes(product.sizes)
    };

    const { data, error } = await client
      .from("products")
      .insert([cleanedProduct])
      .select()
      .single();

    if (error) throw error;

    clearProductsCache();
    return normalizeProduct(data);
  },

  // ADMIN: UPDATE PRODUCT
  async updateProduct(id, updates) {
    if (!id) {
      throw new Error("Product ID is required.");
    }

    const client = getSupabaseClient();
    const cleanedUpdates = { ...updates };

    if (Object.prototype.hasOwnProperty.call(cleanedUpdates, "sizes")) {
      cleanedUpdates.sizes = normalizeSizes(cleanedUpdates.sizes);
    }

    const { data, error } = await client
      .from("products")
      .update(cleanedUpdates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    clearProductsCache();
    return normalizeProduct(data);
  },

  // ADMIN: DELETE PRODUCT
  async deleteProduct(id) {
    if (!id) {
      throw new Error("Product ID is required.");
    }

    const client = getSupabaseClient();

    const { error } = await client
      .from("products")
      .delete()
      .eq("id", id);

    if (error) throw error;

    clearProductsCache();
    return true;
  },

  // ADMIN: LOW STOCK PRODUCTS
  async getLowStockProducts() {
    const client = getSupabaseClient();

    const { data, error } = await client
      .from("products")
      .select("*")
      .eq("is_active", true)
      .eq("low_stock_alert", true);

    if (error) throw error;

    return (data || [])
      .filter(product =>
        Number(product.stock || 0) <=
        Number(product.low_stock_threshold ?? 5)
      )
      .map(normalizeProduct);
  },

  // CLEAR CUSTOMER CACHE
  clearProductCache() {
    clearProductsCache();
    return true;
  }

};

window.store = store;
