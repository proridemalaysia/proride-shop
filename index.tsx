
import React, { useState, useEffect, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { ShoppingCart, Check, X, Loader2, Package, AlertCircle, Database, Lock, LogIn, Save, RefreshCw, Gift, Trash2, UploadCloud } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
// We import data only for the initial seeding process. 
// Once seeded, the app relies on Supabase.
import { products as initialProducts, models as initialModels, images as initialImages } from './data';

// --- Configuration ---
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const TOYYIB_SECRET = import.meta.env.VITE_TOYYIB_SECRET || '';
const TOYYIB_CODE = import.meta.env.VITE_TOYYIB_CODE || '';

// --- Types ---
interface Product {
  CODE: string;
  MODEL: string;
  VARIANT: string;
  POSITION: string;
  PRICE: number;
  QUANTITY?: number; // Used for stock display
}

interface CartItem extends Product {
  cartId: string;
}

interface CustomerDetails {
  name: string;
  email: string;
  phone: string;
  address: string;
  postcode: string;
}

interface ShippingOption {
  service_id: string;
  courier_name: string;
  service_type: 'Air' | 'Sea' | 'Land';
  price: number;
  etd: string;
}

interface Voucher {
  id: number;
  code: string;
  amount: number;
  valid_from: string;
  valid_to: string;
}

interface OrderReceipt {
  billCode: string;
  items: CartItem[];
  amount: number;
  discount: number;
  gifts: string[];
}

// --- Helper Functions ---

const getProductWeight = (product: Product): number => {
  if (product.VARIANT === 'SPORT SPRING') return 8;
  if (product.POSITION === 'FRONT') return 10;
  if (product.POSITION === 'REAR') return 5;
  if (product.POSITION === '1SET') return 15;
  return 5; 
};

const getMalaysiaTime = () => {
    const now = new Date();
    const offset = 8 * 60; 
    const localTime = new Date(now.getTime() + (offset * 60 * 1000));
    return localTime.toISOString().replace('Z', '');
};

const getVariantStyles = (variant: string) => {
  const v = variant.toUpperCase();
  switch (v) {
    case 'STANDARD': return { header: 'bg-black text-white', button: 'bg-black hover:bg-gray-800 text-white', price: 'text-gray-900' };
    case 'HEAVY DUTY': return { header: 'bg-[#800000] text-white', button: 'bg-[#800000] hover:bg-[#600000] text-white', price: 'text-[#800000]' };
    case 'PERFORMANCE': return { header: 'bg-yellow-400 text-black', button: 'bg-yellow-400 hover:bg-yellow-500 text-black', price: 'text-yellow-600' };
    case 'SPORT SPRING': return { header: 'bg-red-600 text-white', button: 'bg-red-600 hover:bg-red-700 text-white', price: 'text-red-600' };
    default: return { header: 'bg-blue-900 text-white', button: 'bg-blue-600 hover:bg-blue-700 text-white', price: 'text-blue-600' };
  }
};

const SHIRT_SIZES = ['S', 'M', 'L', 'XL', 'XXL'];

// --- Components ---

const App = () => {
  // --- Data State (Fetched from Supabase) ---
  const [dbProducts, setDbProducts] = useState<Product[]>([]);
  const [dbModels, setDbModels] = useState<string[]>([]);
  const [dbImages, setDbImages] = useState<Record<string, string>>({});
  const [isDataLoaded, setIsDataLoaded] = useState(false);

  // State: Selection
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [selectedVariant, setSelectedVariant] = useState<string>('');
  
  // State: Real Stock Data
  const [stockLevels, setStockLevels] = useState<Record<string, number>>({});
  const [isLoadingStock, setIsLoadingStock] = useState(false);

  // State: Admin Mode
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [adminPass, setAdminPass] = useState('');
  const [editingStock, setEditingStock] = useState<Record<string, number>>({});
  const [adminTab, setAdminTab] = useState<'stock' | 'vouchers' | 'gifts' | 'settings'>('stock');
  const [adminVouchers, setAdminVouchers] = useState<Voucher[]>([]);
  const [newVoucher, setNewVoucher] = useState({ code: '', amount: '', from: '', to: '' });
  const [isSeeding, setIsSeeding] = useState(false);

  // State: Cart & UI
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isCheckout, setIsCheckout] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState<OrderReceipt | null>(null);
  
  // State: Checkout Form
  const [customer, setCustomer] = useState<CustomerDetails>({ name: '', email: '', phone: '', address: '', postcode: '' });
  
  // State: Voucher & Gifts
  const [voucherInput, setVoucherInput] = useState('');
  const [appliedVoucher, setAppliedVoucher] = useState<{code: string, amount: number} | null>(null);
  const [voucherMsg, setVoucherMsg] = useState('');
  const [selectedShirtSize, setSelectedShirtSize] = useState('');

  // State: Shipping & Payment
  const [availableCouriers, setAvailableCouriers] = useState<ShippingOption[]>([]);
  const [selectedCourier, setSelectedCourier] = useState<ShippingOption | null>(null);
  const [isCalculatingShipping, setIsCalculatingShipping] = useState(false);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false); 
  const [errorMsg, setErrorMsg] = useState('');

  // --- Supabase Client ---
  const supabase = useMemo(() => {
    if (SUPABASE_URL && SUPABASE_KEY) {
      return createClient(SUPABASE_URL, SUPABASE_KEY);
    }
    return null;
  }, []);

  // --- Effects ---

  // Initial Fetch: Catalog & Stock
  useEffect(() => {
    if (supabase) {
      fetchCatalog();
      fetchStock();
    }
  }, [supabase]);

  // Fetch product definitions from Supabase (Secure from GitHub)
  const fetchCatalog = async () => {
    if (!supabase) return;
    try {
        const [prodRes, imgRes, modelRes] = await Promise.all([
            supabase.from('product_catalog').select('*'),
            supabase.from('product_images').select('*'),
            supabase.from('car_models').select('*')
        ]);

        if (prodRes.data && prodRes.data.length > 0) {
            setDbProducts(prodRes.data.map((p: any) => ({
                CODE: p.code,
                MODEL: p.model,
                VARIANT: p.variant,
                POSITION: p.position,
                PRICE: p.price
            })));
        } else {
            // Fallback if DB is empty so site isn't broken before seeding
            setDbProducts(initialProducts.map(p => ({...p, PRICE: p.PRICE, QUANTITY: 0})));
        }

        if (imgRes.data && imgRes.data.length > 0) {
            const imgMap: Record<string, string> = {};
            imgRes.data.forEach((i: any) => imgMap[i.model_variant_key] = i.url);
            setDbImages(imgMap);
        } else {
            setDbImages(initialImages);
        }

        if (modelRes.data && modelRes.data.length > 0) {
           setDbModels(modelRes.data.map((m: any) => m.name));
        } else {
           setDbModels(Object.keys(initialModels));
        }

        setIsDataLoaded(true);

    } catch (e) {
        console.error("Catalog Load Error", e);
    }
  };

  const fetchStock = async () => {
    if (!supabase) return;
    setIsLoadingStock(true);
    const { data, error } = await supabase.from('inventory').select('*');
    if (data) {
        const levels: Record<string, number> = {};
        data.forEach((item: any) => levels[item.product_code] = item.quantity);
        setStockLevels(levels);
    }
    setIsLoadingStock(false);
  };

  const fetchVouchers = async () => {
      if (!supabase || !isAdmin) return;
      const { data } = await supabase.from('vouchers').select('*').order('valid_from', { ascending: false });
      if (data) setAdminVouchers(data);
  };

  useEffect(() => {
      if (isAdmin && adminTab === 'vouchers') fetchVouchers();
  }, [isAdmin, adminTab]);

  // --- Computed Data ---
  const availableVariants = useMemo(() => {
    if (!selectedModel) return [];
    const modelProducts = dbProducts.filter(p => p.MODEL === selectedModel);
    return Array.from(new Set(modelProducts.map(p => p.VARIANT)));
  }, [selectedModel, dbProducts]);

  const displayedProducts = useMemo(() => {
    if (!selectedModel || !selectedVariant) return [];
    return dbProducts.filter(p => p.MODEL === selectedModel && p.VARIANT === selectedVariant);
  }, [selectedModel, selectedVariant, dbProducts]);

  const currentImage = useMemo(() => {
    if (!selectedModel || !selectedVariant) return null;
    let variantSuffix = '';
    if (selectedVariant === 'STANDARD') variantSuffix = 'Standard Absorber';
    else if (selectedVariant === 'HEAVY DUTY') variantSuffix = 'Heavy Duty Absorber';
    else if (selectedVariant === 'PERFORMANCE') variantSuffix = 'Performance Absorber';
    else if (selectedVariant === 'SPORT SPRING') variantSuffix = 'Sport Spring';
    const key = `${selectedModel}-${variantSuffix}`;
    return dbImages[key] || 'https://placehold.co/600x400?text=No+Image';
  }, [selectedModel, selectedVariant, dbImages]);

  const variantStyles = useMemo(() => getVariantStyles(selectedVariant), [selectedVariant]);
  const subtotal = cart.reduce((sum, item) => sum + item.PRICE, 0);
  const totalWeight = cart.reduce((sum, item) => sum + getProductWeight(item), 0);
  
  const hasShirtGift = useMemo(() => {
      return cart.some(item => item.POSITION === '1SET');
  }, [cart]);

  const finalTotal = Math.max(0, subtotal + (selectedCourier ? selectedCourier.price : 0) - (appliedVoucher?.amount || 0));

  // --- Admin Actions ---
  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminPass === 'admin123') {
        setIsAdmin(true);
        setShowAdminLogin(false);
    } else {
        alert("Incorrect password");
    }
  };

  // Seeding Function: Migrates data.ts to Supabase
  const seedDatabase = async () => {
      if (!supabase || !confirm("This will overwrite/fill the database with initial data. Continue?")) return;
      setIsSeeding(true);
      try {
          // 1. Seed Models
          for (const [model, make] of Object.entries(initialModels)) {
              await supabase.from('car_models').upsert({ name: model, make }, { onConflict: 'name' });
          }
          // 2. Seed Images
          for (const [key, url] of Object.entries(initialImages)) {
              await supabase.from('product_images').upsert({ model_variant_key: key, url }, { onConflict: 'model_variant_key' });
          }
          // 3. Seed Products (Catalog + Inventory)
          for (const p of initialProducts) {
              // Catalog
              await supabase.from('product_catalog').upsert({
                  code: p.CODE,
                  model: p.MODEL,
                  variant: p.VARIANT,
                  position: p.POSITION,
                  price: p.PRICE
              }, { onConflict: 'code' });
              
              // Inventory (Only if not exists to preserve current stock)
              const { data } = await supabase.from('inventory').select('product_code').eq('product_code', p.CODE).single();
              if (!data) {
                 await supabase.from('inventory').insert({ product_code: p.CODE, quantity: p.QUANTITY });
              }
          }
          alert("Database seeded successfully!");
          fetchCatalog();
          fetchStock();
      } catch (e: any) {
          alert("Seeding failed: " + e.message);
      } finally {
          setIsSeeding(false);
      }
  };

  const updateStock = async (code: string, newQty: number) => {
    if (!supabase) return alert("Database not connected");
    // Admins can use direct upsert, or we can use an RPC if we want strict logging
    const { error } = await supabase
        .from('inventory')
        .upsert({ product_code: code, quantity: newQty }, { onConflict: 'product_code' });
    if (error) {
        alert("Failed to update stock");
    } else {
        setStockLevels(prev => ({ ...prev, [code]: newQty }));
        setEditingStock(prev => {
            const next = { ...prev };
            delete next[code];
            return next;
        });
    }
  };

  const createVoucher = async () => {
      if (!supabase) return;
      if (!newVoucher.code || !newVoucher.amount || !newVoucher.from || !newVoucher.to) return alert("Fill all fields");
      const { error } = await supabase.from('vouchers').insert([{
          code: newVoucher.code.toUpperCase(),
          amount: parseFloat(newVoucher.amount),
          valid_from: new Date(newVoucher.from).toISOString(),
          valid_to: new Date(newVoucher.to).toISOString()
      }]);
      if (error) alert(error.message);
      else {
          setNewVoucher({ code: '', amount: '', from: '', to: '' });
          fetchVouchers();
      }
  };

  const deleteVoucher = async (id: number) => {
      if (!confirm("Delete voucher?")) return;
      await supabase?.from('vouchers').delete().eq('id', id);
      fetchVouchers();
  };

  // --- Shop Handlers ---
  const addToCart = (product: Product) => {
    const currentStock = stockLevels[product.CODE] ?? 0;
    const inCart = cart.filter(c => c.CODE === product.CODE).length;
    if (currentStock - inCart <= 0) return alert("Out of stock!");
    setCart([...cart, { ...product, cartId: Math.random().toString(36).substr(2, 9) }]);
    setIsCartOpen(true);
  };

  const removeFromCart = (cartId: string) => {
    setCart(cart.filter(item => item.cartId !== cartId));
    setAvailableCouriers([]);
    setSelectedCourier(null);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setCustomer({ ...customer, [e.target.name]: e.target.value });
    if (e.target.name === 'postcode') {
        setAvailableCouriers([]);
        setSelectedCourier(null);
    }
  };

  const applyVoucher = async () => {
      setVoucherMsg('');
      if (!voucherInput.trim()) return;
      if (!supabase) return setVoucherMsg("System offline");
      const { data, error } = await supabase
          .from('vouchers')
          .select('*')
          .eq('code', voucherInput.toUpperCase())
          .eq('is_active', true)
          .single();
      if (error || !data) {
          setVoucherMsg("Invalid voucher code");
          setAppliedVoucher(null);
          return;
      }
      const now = new Date();
      const validFrom = new Date(data.valid_from);
      const validTo = new Date(data.valid_to);
      if (now < validFrom || now > validTo) {
          setVoucherMsg("Voucher expired");
          setAppliedVoucher(null);
          return;
      }
      setAppliedVoucher({ code: data.code, amount: data.amount });
      setVoucherMsg(`Voucher applied! -RM${data.amount}`);
  };

  // --- Shipping & Payment ---
  const calculateShipping = async () => {
    if (!customer.postcode || customer.postcode.length !== 5) {
      setErrorMsg("Please enter a valid 5-digit postcode.");
      return;
    }
    if (cart.length === 0) return;
    setIsCalculatingShipping(true);
    setErrorMsg('');
    try {
      await new Promise(r => setTimeout(r, 800)); 
      const postcodeNum = parseInt(customer.postcode);
      const isEastMalaysia = postcodeNum >= 87000 && postcodeNum <= 99999;
      let options: ShippingOption[] = [];
      if (isEastMalaysia) {
        options.push({ service_id: 'poslaju_air', courier_name: 'Pos Laju', service_type: 'Air', price: 20 + (totalWeight * 15), etd: '3-5 Days' });
        options.push({ service_id: 'jnt_air', courier_name: 'J&T Express', service_type: 'Air', price: 25 + (totalWeight * 16), etd: '2-4 Days' });
        options.push({ service_id: 'pos_sea', courier_name: 'Pos Malaysia Sea Freight', service_type: 'Sea', price: 15 + (totalWeight * 4), etd: '21-30 Days' });
      } else {
        options.push({ service_id: 'jnt_land', courier_name: 'J&T Express', service_type: 'Land', price: 8 + (totalWeight * 2), etd: '1-3 Days' });
        options.push({ service_id: 'poslaju_land', courier_name: 'Pos Laju', service_type: 'Land', price: 9 + (totalWeight * 1.8), etd: '2-4 Days' });
      }
      options.sort((a, b) => a.price - b.price);
      setAvailableCouriers(options);
    } catch (err) {
      setErrorMsg("Shipping calculation failed.");
    } finally {
      setIsCalculatingShipping(false);
    }
  };

  const initiatePayment = async () => {
    if (!customer.name || !customer.email || !customer.phone || !customer.address) return setErrorMsg("Fill all details.");
    if (!selectedCourier) return setErrorMsg("Select a courier.");
    if (hasShirtGift && !selectedShirtSize) return setErrorMsg("Please select your Free T-Shirt size.");

    setIsProcessingPayment(true);
    setErrorMsg('');

    let orderId: number | null = null;
    const gifts = ['Proride Sticker'];
    if (hasShirtGift && selectedShirtSize) gifts.push(`Proride T-Shirt (${selectedShirtSize})`);

    try {
      // 1. Save Order to Supabase (WITH NEW COLUMNS)
      if (supabase) {
        const itemsSummary = cart.map(item => `${item.MODEL} ${item.VARIANT} - ${item.POSITION} (x${item.PRICE})`).join(', ');
        const { data, error } = await supabase.from('orders').insert([{
            created_at: getMalaysiaTime(),
            customer_name: customer.name,
            customer_email: customer.email,
            customer_phone: customer.phone,
            customer_address: customer.address,
            customer_postcode: customer.postcode,
            total_amount: finalTotal,
            shipping_cost: selectedCourier.price,
            courier_name: selectedCourier.courier_name,
            service_type: selectedCourier.service_type,
            items: cart,
            items_summary: itemsSummary,
            discount_amount: appliedVoucher?.amount || 0,
            voucher_code: appliedVoucher?.code || null,
            gifts: gifts, // Correctly saving gifts array now
            status: 'pending_payment'
        }]).select('id').single();
        
        if (error) console.error("DB Error", error);
        if (data) orderId = data.id;
      }

      // 2. ToyyibPay Logic
      if (TOYYIB_SECRET && TOYYIB_CODE) {
         const formBody = new URLSearchParams({
            userSecretKey: TOYYIB_SECRET,
            categoryCode: TOYYIB_CODE,
            billName: `Proride - Order #${orderId || 'New'}`,
            billDescription: `Parts + Shipping (Ref: ${orderId})`,
            billPriceSetting: '1',
            billPayorInfo: '1',
            billAmount: (finalTotal * 100).toFixed(0),
            billReturnUrl: window.location.href,
            billCallbackUrl: window.location.href,
            billTo: customer.name,
            billEmail: customer.email,
            billPhone: customer.phone,
            billSplitPayment: '0',
            billSplitPaymentArgs: '',
            billPaymentChannel: '0',
            billContentEmail: 'Thank you for your purchase!',
            billChargeToCustomer: '1'
         });
         try {
             const response = await fetch('https://toyyibpay.com/index.php/api/createBill', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: formBody
             });
             const result = await response.json();
             if (result && result[0]?.BillCode) {
                 window.location.href = `https://toyyibpay.com/${result[0].BillCode}`;
                 return;
             } else {
                 throw new Error("ToyyibPay Error");
             }
         } catch (e) {
             console.error(e);
             alert("Direct API call blocked. Showing simulator.");
             setShowPaymentModal(true); 
         }
      } else {
        setShowPaymentModal(true); 
      }
    } catch (err) {
      setErrorMsg("Payment processing failed.");
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const finalizeMockPayment = async (success: boolean) => {
    setShowPaymentModal(false);
    if (success && selectedCourier) {
      const gifts = ['Proride Sticker'];
      if (hasShirtGift && selectedShirtSize) gifts.push(`Proride T-Shirt (${selectedShirtSize})`);
      
      setOrderSuccess({
        billCode: 'TP-MOCK-' + Math.floor(Math.random() * 100000),
        items: [...cart],
        amount: finalTotal,
        discount: appliedVoucher?.amount || 0,
        gifts: gifts
      });
      
      // Secure Stock Update via RPC
      if (supabase) {
          for (const item of cart) {
              await supabase.rpc('decrement_stock', { p_code: item.CODE, qty: 1 });
          }
          if (hasShirtGift && selectedShirtSize) {
              await supabase.rpc('decrement_stock', { p_code: `GIFT-SHIRT-${selectedShirtSize}`, qty: 1 });
          }
          // Refresh local view
          fetchStock();
      }
      
      setCart([]);
      setAppliedVoucher(null);
      setVoucherInput('');
      setSelectedShirtSize('');
    }
  };

  const resetShop = () => {
    setOrderSuccess(null);
    setIsCheckout(false);
    setCart([]);
    setCustomer({ name: '', email: '', phone: '', address: '', postcode: '' });
    setAvailableCouriers([]);
    setSelectedCourier(null);
    setAppliedVoucher(null);
    setVoucherInput('');
    setSelectedShirtSize('');
    fetchStock();
  }

  // --- Views ---

  if (orderSuccess) return (
      <div className="min-h-screen bg-gray-50 p-8 font-sans flex items-center justify-center">
        <div className="max-w-xl w-full bg-white rounded-xl shadow-lg border border-gray-100 p-8 text-center">
             <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6 text-green-600">
                <Check className="w-10 h-10" />
             </div>
             <h1 className="text-3xl font-bold text-gray-900 mb-2">Order Successful</h1>
             <p className="text-gray-500 mb-8">Ref: {orderSuccess.billCode}</p>
             <div className="bg-gray-50 p-4 rounded text-left text-sm mb-6">
                 <div className="font-bold mb-2">Includes:</div>
                 {orderSuccess.items.map(i => <div key={i.cartId}>• {i.MODEL} {i.VARIANT}</div>)}
                 {orderSuccess.gifts.map(g => <div key={g} className="text-green-600">• {g} (FREE)</div>)}
                 {orderSuccess.discount > 0 && <div className="mt-2 text-blue-600 font-bold">Discount: -RM {orderSuccess.discount.toFixed(2)}</div>}
             </div>
             <button onClick={resetShop} className="w-full bg-blue-900 text-white py-3 rounded-xl font-bold hover:bg-blue-800">
                Back to Store
             </button>
        </div>
      </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 text-slate-800 font-sans pb-20">
      <header className="bg-white shadow-sm sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-blue-900 tracking-tight cursor-pointer" onClick={resetShop}>Proride Parts</h1>
              {isAdmin && <span className="bg-red-100 text-red-600 text-xs px-2 py-1 rounded-full font-bold border border-red-200">ADMIN</span>}
          </div>
          <button onClick={() => setIsCartOpen(true)} className="relative p-2 text-gray-600 hover:text-blue-600">
            <ShoppingCart className="w-6 h-6" />
            {cart.length > 0 && <span className="absolute top-0 right-0 bg-red-500 text-white text-xs font-bold w-5 h-5 flex items-center justify-center rounded-full">{cart.length}</span>}
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {!isCheckout ? (
          <div className="space-y-8">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 grid md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Car Model</label>
                <select className="w-full p-3 border rounded-lg" value={selectedModel} onChange={(e) => { setSelectedModel(e.target.value); setSelectedVariant(''); }}>
                  <option value="">Select a Model</option>
                  {dbModels.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Product Type</label>
                <select className="w-full p-3 border rounded-lg" value={selectedVariant} onChange={(e) => setSelectedVariant(e.target.value)} disabled={!selectedModel}>
                  <option value="">Select Variant</option>
                  {availableVariants.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
            </div>

            {selectedModel && selectedVariant && (
              <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden animate-fade-in">
                <div className={`${variantStyles.header} p-4 text-center`}><h2 className="text-xl font-bold">{selectedModel} - {selectedVariant}</h2></div>
                <div className="grid md:grid-cols-2 gap-0">
                  <div className="p-8 bg-gray-50 flex items-center justify-center border-r border-gray-100">
                    {currentImage && <img src={currentImage} className="max-w-full max-h-80 object-contain drop-shadow-md" />}
                  </div>
                  <div className="p-6 space-y-4">
                    {displayedProducts.map(product => {
                      const stock = stockLevels[product.CODE] ?? 0;
                      const cartQty = cart.filter(c => c.CODE === product.CODE).length;
                      const available = Math.max(0, stock - cartQty);
                      const isLow = available < 3 && available > 0;
                      const isOut = available === 0;

                      return (
                        <div key={product.CODE} className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                          <div className="flex justify-between items-start mb-2">
                            <div>
                                <div className="font-bold text-gray-800">{product.POSITION === '1SET' ? 'FULL SET' : product.POSITION}</div>
                                <div className="text-xs text-gray-400 font-mono">{product.CODE}</div>
                            </div>
                            <div className={`font-bold text-lg ${variantStyles.price}`}>RM {product.PRICE.toFixed(2)}</div>
                          </div>

                          <div className="flex justify-between items-end">
                              <div className="text-sm">
                                  {isLoadingStock ? <Loader2 className="w-3 h-3 animate-spin text-gray-400"/> : (
                                      <div className={`font-semibold ${isOut ? 'text-red-500' : isLow ? 'text-orange-500' : 'text-green-600'}`}>
                                          {isOut ? 'Out of Stock' : `Stock: ${available}`}
                                      </div>
                                  )}
                              </div>

                              {isAdmin ? (
                                  <div className="flex items-center gap-2">
                                      <input 
                                        type="number" 
                                        className="w-16 p-1 border rounded text-center text-sm"
                                        value={editingStock[product.CODE] ?? stock}
                                        onChange={(e) => setEditingStock({...editingStock, [product.CODE]: parseInt(e.target.value)})}
                                      />
                                      {editingStock[product.CODE] !== undefined && (
                                        <button 
                                            onClick={() => updateStock(product.CODE, editingStock[product.CODE]!)}
                                            className="bg-green-600 text-white p-1 rounded hover:bg-green-700"
                                            title="Save Stock"
                                        >
                                            <Save className="w-4 h-4" />
                                        </button>
                                      )}
                                  </div>
                              ) : (
                                  <button onClick={() => addToCart(product)} disabled={isOut} className={`${variantStyles.button} px-4 py-2 rounded-lg text-sm font-medium ${isOut ? 'opacity-50 cursor-not-allowed bg-gray-400' : ''}`}>
                                    {isOut ? 'No Stock' : 'Add to Cart'}
                                  </button>
                              )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
            
            {!selectedModel && (
              <div className="text-center py-20 bg-white rounded-xl border-dashed border border-gray-300">
                <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-gray-500">Select model to begin</h3>
              </div>
            )}
          </div>
        ) : (
          <div className="grid lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
                <button onClick={() => setIsCheckout(false)} className="text-sm text-gray-500">← Back</button>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h2 className="font-bold text-xl mb-4">Details</h2>
                    <div className="grid md:grid-cols-2 gap-4">
                        <input name="name" placeholder="Name" value={customer.name} onChange={handleInputChange} className="border p-2 rounded col-span-2" />
                        <input name="email" placeholder="Email" value={customer.email} onChange={handleInputChange} className="border p-2 rounded" />
                        <input name="phone" placeholder="Phone" value={customer.phone} onChange={handleInputChange} className="border p-2 rounded" />
                        <textarea name="address" placeholder="Address" value={customer.address} onChange={handleInputChange} className="border p-2 rounded col-span-2" />
                        <input name="postcode" placeholder="Postcode (e.g. 88000)" value={customer.postcode} onChange={handleInputChange} className="border p-2 rounded" />
                        <button onClick={calculateShipping} disabled={isCalculatingShipping} className="bg-slate-800 text-white rounded p-2 flex justify-center items-center gap-2">
                            {isCalculatingShipping ? <Loader2 className="animate-spin w-4 h-4"/> : "Check Shipping"}
                        </button>
                    </div>
                    {availableCouriers.length > 0 && (
                        <div className="mt-6 space-y-2">
                            <h3 className="font-bold">Select Courier</h3>
                            {availableCouriers.map(c => (
                                <div key={c.service_id} onClick={() => setSelectedCourier(c)} className={`p-3 border rounded cursor-pointer flex justify-between ${selectedCourier?.service_id === c.service_id ? 'border-blue-500 bg-blue-50' : ''}`}>
                                    <div><div className="font-bold">{c.courier_name}</div><div className="text-xs text-gray-500">{c.service_type} • {c.etd}</div></div>
                                    <div className="font-bold text-blue-900">RM {c.price.toFixed(2)}</div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
            
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 h-fit sticky top-24">
                <h2 className="font-bold mb-4">Summary</h2>
                {cart.map(i => <div key={i.cartId} className="flex justify-between text-sm mb-2"><span>{i.MODEL} {i.VARIANT}</span><span>RM {i.PRICE}</span></div>)}
                
                <div className="border-t border-dashed my-3 py-2">
                    <div className="flex justify-between text-sm text-green-600 font-bold items-center mb-1">
                        <span className="flex items-center gap-1"><Gift className="w-3 h-3"/> Proride Sticker (x1)</span>
                        <span>FREE</span>
                    </div>
                    {hasShirtGift && (
                        <div className="space-y-2 mt-2">
                            <div className="flex justify-between text-sm text-green-600 font-bold items-center">
                                <span className="flex items-center gap-1"><Gift className="w-3 h-3"/> Proride T-Shirt (x1)</span>
                                <span>FREE</span>
                            </div>
                            <select 
                                value={selectedShirtSize} 
                                onChange={(e) => setSelectedShirtSize(e.target.value)}
                                className="w-full text-sm border border-green-200 rounded p-2 bg-green-50"
                            >
                                <option value="">Select Size...</option>
                                {SHIRT_SIZES.map(size => {
                                    const qty = stockLevels[`GIFT-SHIRT-${size}`] ?? 0;
                                    return (
                                        <option key={size} value={size} disabled={qty <= 0}>
                                            {size} {qty <= 0 ? '(Out of Stock)' : `(${qty} left)`}
                                        </option>
                                    );
                                })}
                            </select>
                        </div>
                    )}
                </div>

                <div className="border-t pt-4 mt-2">
                    <div className="flex gap-2 mb-2">
                        <input 
                            placeholder="Voucher Code" 
                            className="border p-2 rounded text-sm flex-1 uppercase"
                            value={voucherInput}
                            onChange={(e) => setVoucherInput(e.target.value)}
                            disabled={!!appliedVoucher}
                        />
                        {appliedVoucher ? (
                            <button onClick={() => { setAppliedVoucher(null); setVoucherInput(''); setVoucherMsg(''); }} className="bg-red-100 text-red-500 p-2 rounded"><X className="w-4 h-4"/></button>
                        ) : (
                            <button onClick={applyVoucher} className="bg-gray-800 text-white p-2 rounded text-xs font-bold">APPLY</button>
                        )}
                    </div>
                    {voucherMsg && <div className={`text-xs mb-2 ${appliedVoucher ? 'text-green-600' : 'text-red-500'}`}>{voucherMsg}</div>}
                </div>

                <div className="border-t pt-2 space-y-1">
                    <div className="flex justify-between text-sm text-gray-500"><span>Subtotal</span><span>RM {subtotal.toFixed(2)}</span></div>
                    {selectedCourier && <div className="flex justify-between text-sm text-gray-500"><span>Shipping</span><span>RM {selectedCourier.price.toFixed(2)}</span></div>}
                    {appliedVoucher && <div className="flex justify-between text-sm text-green-600"><span>Discount</span><span>-RM {appliedVoucher.amount.toFixed(2)}</span></div>}
                    <div className="flex justify-between font-bold text-lg mt-2 pt-2 border-t"><span>Total</span><span>RM {finalTotal.toFixed(2)}</span></div>
                </div>

                {errorMsg && <div className="text-red-500 text-sm mt-2 flex items-center gap-1"><AlertCircle className="w-4 h-4"/> {errorMsg}</div>}
                <button onClick={initiatePayment} disabled={isProcessingPayment || !selectedCourier} className="w-full bg-blue-600 text-white py-3 rounded-xl mt-4 font-bold disabled:opacity-50">
                    {isProcessingPayment ? "Processing..." : "Pay Now"}
                </button>
            </div>
          </div>
        )}
      </main>
      
      <footer className="bg-white border-t py-8 mt-12">
          <div className="max-w-5xl mx-auto px-4 text-center">
              <p className="text-gray-400 text-sm mb-2">&copy; 2024 Proride Parts Store. All rights reserved.</p>
              <div className="text-gray-300 text-xs font-mono mb-4 flex items-center justify-center gap-1"><Lock className="w-3 h-3"/> System Locked: 09 Dec 2025, 10:12PM</div>
              {!isAdmin ? (
                  <button onClick={() => setShowAdminLogin(true)} className="text-gray-300 hover:text-gray-500 text-xs flex items-center justify-center gap-1 mx-auto">
                      <LogIn className="w-3 h-3" /> Staff Access
                  </button>
              ) : (
                  <div className="flex gap-4 justify-center">
                    <div className="text-green-600 text-xs font-bold flex items-center gap-1"><Check className="w-3 h-3"/> Admin Mode Active</div>
                    <button onClick={() => setIsAdmin(false)} className="text-red-400 text-xs hover:text-red-600">Logout</button>
                  </div>
              )}
          </div>
      </footer>

      {(showAdminLogin || isAdmin) && (
          <div className={`fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 ${isAdmin ? 'items-end sm:items-center' : ''}`}>
             {!isAdmin ? (
                 <div className="bg-white p-6 rounded-xl shadow-xl w-full max-w-sm">
                    <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><LogIn className="w-5 h-5"/> Staff Login</h3>
                    <form onSubmit={handleAdminLogin}>
                        <input type="password" className="w-full border p-2 rounded mb-4" placeholder="Enter password" value={adminPass} onChange={e => setAdminPass(e.target.value)} autoFocus />
                        <div className="flex justify-end gap-2">
                            <button type="button" onClick={() => setShowAdminLogin(false)} className="px-4 py-2 text-gray-500">Cancel</button>
                            <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded">Login</button>
                        </div>
                    </form>
                 </div>
             ) : (
                 <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[80vh] flex flex-col">
                     <div className="p-4 border-b flex justify-between items-center bg-gray-50 rounded-t-xl">
                         <h3 className="font-bold flex items-center gap-2"><Database className="w-5 h-5"/> Shop Management</h3>
                         <button onClick={() => setIsAdmin(false)} className="text-gray-500 hover:text-red-500"><X/></button>
                     </div>
                     <div className="flex border-b overflow-x-auto">
                         <button onClick={() => setAdminTab('stock')} className={`flex-1 p-3 text-sm font-bold whitespace-nowrap ${adminTab === 'stock' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500'}`}>Product Stock</button>
                         <button onClick={() => setAdminTab('gifts')} className={`flex-1 p-3 text-sm font-bold whitespace-nowrap ${adminTab === 'gifts' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500'}`}>Gifts Inventory</button>
                         <button onClick={() => setAdminTab('vouchers')} className={`flex-1 p-3 text-sm font-bold whitespace-nowrap ${adminTab === 'vouchers' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500'}`}>Vouchers</button>
                         <button onClick={() => setAdminTab('settings')} className={`flex-1 p-3 text-sm font-bold whitespace-nowrap ${adminTab === 'settings' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500'}`}>Settings</button>
                     </div>
                     <div className="p-6 overflow-y-auto">
                         {adminTab === 'stock' && (
                             <div className="space-y-4">
                                 <div className="flex justify-between items-center mb-4">
                                     <p className="text-sm text-gray-500">Edit quantities for main products.</p>
                                     <button onClick={fetchStock} className="flex items-center gap-1 text-sm text-blue-600"><RefreshCw className="w-3 h-3"/> Refresh</button>
                                 </div>
                                 {selectedModel && selectedVariant ? (
                                     displayedProducts.map(p => (
                                         <div key={p.CODE} className="flex justify-between items-center border-b py-2">
                                             <div className="text-sm"><span className="font-bold">{p.CODE}</span> {p.MODEL} {p.POSITION}</div>
                                             <div className="flex gap-2">
                                                 <input type="number" className="w-20 border p-1 rounded text-center" value={editingStock[p.CODE] ?? (stockLevels[p.CODE]||0)} onChange={(e) => setEditingStock({...editingStock, [p.CODE]: parseInt(e.target.value)})} />
                                                 {editingStock[p.CODE] !== undefined && <button onClick={() => updateStock(p.CODE, editingStock[p.CODE]!)} className="bg-green-600 text-white p-1 rounded"><Save className="w-4 h-4"/></button>}
                                             </div>
                                         </div>
                                     ))
                                 ) : (
                                     <div className="text-center py-8 text-gray-400">Select a Model & Variant on the main page to filter stock here.</div>
                                 )}
                             </div>
                         )}

                         {adminTab === 'gifts' && (
                             <div className="space-y-4">
                                 <h4 className="font-bold mb-4">T-Shirt Inventory</h4>
                                 {SHIRT_SIZES.map(size => {
                                     const code = `GIFT-SHIRT-${size}`;
                                     return (
                                        <div key={code} className="flex justify-between items-center border-b py-2">
                                            <div className="text-sm font-bold">Size {size}</div>
                                            <div className="flex gap-2">
                                                 <input type="number" className="w-20 border p-1 rounded text-center" value={editingStock[code] ?? (stockLevels[code]||0)} onChange={(e) => setEditingStock({...editingStock, [code]: parseInt(e.target.value)})} />
                                                 {editingStock[code] !== undefined && <button onClick={() => updateStock(code, editingStock[code]!)} className="bg-green-600 text-white p-1 rounded"><Save className="w-4 h-4"/></button>}
                                            </div>
                                        </div>
                                     );
                                 })}
                             </div>
                         )}

                         {adminTab === 'vouchers' && (
                             <div className="space-y-6">
                                 <div className="bg-gray-50 p-4 rounded-lg border">
                                     <h4 className="font-bold text-sm mb-2">Create New Voucher</h4>
                                     <div className="grid grid-cols-2 gap-2 mb-2">
                                         <input placeholder="Code (e.g. PROMO10)" className="border p-2 rounded uppercase text-sm" value={newVoucher.code} onChange={e => setNewVoucher({...newVoucher, code: e.target.value})} />
                                         <input type="number" placeholder="Amount (RM)" className="border p-2 rounded text-sm" value={newVoucher.amount} onChange={e => setNewVoucher({...newVoucher, amount: e.target.value})} />
                                         <div className="flex flex-col"><label className="text-xs text-gray-500">Valid From</label><input type="date" className="border p-2 rounded text-sm" value={newVoucher.from} onChange={e => setNewVoucher({...newVoucher, from: e.target.value})} /></div>
                                         <div className="flex flex-col"><label className="text-xs text-gray-500">Valid To</label><input type="date" className="border p-2 rounded text-sm" value={newVoucher.to} onChange={e => setNewVoucher({...newVoucher, to: e.target.value})} /></div>
                                     </div>
                                     <button onClick={createVoucher} className="bg-blue-600 text-white w-full py-2 rounded text-sm font-bold">Create Voucher</button>
                                 </div>
                                 <div>
                                     <h4 className="font-bold text-sm mb-2">Active Vouchers</h4>
                                     <div className="border rounded-lg overflow-hidden">
                                         <table className="w-full text-sm text-left">
                                             <thead className="bg-gray-100"><tr><th className="p-2">Code</th><th className="p-2">Amount</th><th className="p-2">Ends</th><th className="p-2">Action</th></tr></thead>
                                             <tbody>
                                                 {adminVouchers.map(v => (
                                                     <tr key={v.id} className="border-t">
                                                         <td className="p-2 font-mono font-bold">{v.code}</td>
                                                         <td className="p-2">RM {v.amount}</td>
                                                         <td className="p-2">{new Date(v.valid_to).toLocaleDateString()}</td>
                                                         <td className="p-2"><button onClick={() => deleteVoucher(v.id)} className="text-red-500 hover:bg-red-50 p-1 rounded"><Trash2 className="w-4 h-4"/></button></td>
                                                     </tr>
                                                 ))}
                                             </tbody>
                                         </table>
                                     </div>
                                 </div>
                             </div>
                         )}

                         {adminTab === 'settings' && (
                             <div className="space-y-4">
                                 <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg">
                                     <h4 className="font-bold flex items-center gap-2 mb-2"><Database className="w-4 h-4"/> Database Migration</h4>
                                     <p className="text-sm text-gray-600 mb-4">Click below to upload the initial product catalog, models, and images from the file system to Supabase. Do this only once!</p>
                                     <button onClick={seedDatabase} disabled={isSeeding} className="bg-yellow-600 text-white px-4 py-2 rounded font-bold flex items-center gap-2 disabled:opacity-50">
                                         {isSeeding ? <Loader2 className="animate-spin w-4 h-4"/> : <UploadCloud className="w-4 h-4"/>}
                                         {isSeeding ? "Seeding..." : "Seed Database"}
                                     </button>
                                 </div>
                             </div>
                         )}
                     </div>
                 </div>
             )}
          </div>
      )}
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
