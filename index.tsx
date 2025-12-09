
import React, { useState, useEffect, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { ShoppingCart, Truck, CreditCard, Check, X, Loader2, Package, Ship, Plane, Printer, ExternalLink, AlertCircle, Database, AlertTriangle, Lock, LogIn, Save, RefreshCw } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
import { products, models, images } from './data';

// --- Configuration (Environment Variables) ---
// In Vercel, you will set these in the "Environment Variables" section.
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
  QUANTITY: number;
  PRICE: number;
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

interface OrderReceipt {
  billCode: string;
  transactionId: string;
  amount: number;
  date: string;
  items: CartItem[];
  customer: CustomerDetails;
  shipping: {
    courier: string;
    cost: number;
    type: string;
  };
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

// --- Components ---

const App = () => {
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

  // State: Cart & UI
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isCheckout, setIsCheckout] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState<OrderReceipt | null>(null);
  
  // State: Checkout Form
  const [customer, setCustomer] = useState<CustomerDetails>({ name: '', email: '', phone: '', address: '', postcode: '' });

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

  // Fetch Real Stock on Mount
  useEffect(() => {
    fetchStock();
  }, [supabase]);

  const fetchStock = async () => {
    if (!supabase) return;
    setIsLoadingStock(true);
    
    // We assume a table named 'inventory' with columns: product_code (text), quantity (int)
    const { data, error } = await supabase.from('inventory').select('*');
    
    if (error) {
        console.error("Error fetching stock:", error);
    } else if (data) {
        const levels: Record<string, number> = {};
        data.forEach((item: any) => {
            levels[item.product_code] = item.quantity;
        });
        setStockLevels(levels);
    }
    setIsLoadingStock(false);
  };

  // --- Computed Data ---
  const modelList = useMemo(() => Object.keys(models), []);
  const availableVariants = useMemo(() => {
    if (!selectedModel) return [];
    const modelProducts = products.filter(p => p.MODEL === selectedModel);
    return Array.from(new Set(modelProducts.map(p => p.VARIANT)));
  }, [selectedModel]);

  const displayedProducts = useMemo(() => {
    if (!selectedModel || !selectedVariant) return [];
    return products.filter(p => p.MODEL === selectedModel && p.VARIANT === selectedVariant);
  }, [selectedModel, selectedVariant]);

  const currentImage = useMemo(() => {
    if (!selectedModel || !selectedVariant) return null;
    let variantSuffix = '';
    if (selectedVariant === 'STANDARD') variantSuffix = 'Standard Absorber';
    else if (selectedVariant === 'HEAVY DUTY') variantSuffix = 'Heavy Duty Absorber';
    else if (selectedVariant === 'PERFORMANCE') variantSuffix = 'Performance Absorber';
    else if (selectedVariant === 'SPORT SPRING') variantSuffix = 'Sport Spring';
    const key = `${selectedModel}-${variantSuffix}`;
    return images[key as keyof typeof images] || 'https://placehold.co/600x400?text=No+Image';
  }, [selectedModel, selectedVariant]);

  const variantStyles = useMemo(() => getVariantStyles(selectedVariant), [selectedVariant]);
  const subtotal = cart.reduce((sum, item) => sum + item.PRICE, 0);
  const totalWeight = cart.reduce((sum, item) => sum + getProductWeight(item), 0);
  const finalTotal = subtotal + (selectedCourier ? selectedCourier.price : 0);

  // --- Admin Handlers ---
  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    // Simple hardcoded password for demo purposes. 
    // In production, use Supabase Auth.
    if (adminPass === 'admin123') {
        setIsAdmin(true);
        setShowAdminLogin(false);
    } else {
        alert("Incorrect password");
    }
  };

  const updateStock = async (code: string, newQty: number) => {
    if (!supabase) return alert("Database not connected");
    
    // Upsert: Update if exists, Insert if not
    const { error } = await supabase
        .from('inventory')
        .upsert({ product_code: code, quantity: newQty }, { onConflict: 'product_code' });
    
    if (error) {
        alert("Failed to update stock");
        console.error(error);
    } else {
        setStockLevels(prev => ({ ...prev, [code]: newQty }));
        setEditingStock(prev => {
            const next = { ...prev };
            delete next[code];
            return next;
        });
    }
  };

  // --- Shop Handlers ---

  const addToCart = (product: Product) => {
    // Check Real Stock
    const currentStock = stockLevels[product.CODE] ?? 0; // Default to 0 if not found in DB
    
    // Check if already in cart
    const inCart = cart.filter(c => c.CODE === product.CODE).length;
    
    if (currentStock - inCart <= 0) {
        return alert("Out of stock!");
    }

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

  // --- Payment & Shipping Logic ---

  const calculateShipping = async () => {
    if (!customer.postcode || customer.postcode.length !== 5) {
      setErrorMsg("Please enter a valid 5-digit postcode.");
      return;
    }
    if (cart.length === 0) return;

    setIsCalculatingShipping(true);
    setErrorMsg('');
    
    try {
      await new Promise(r => setTimeout(r, 800)); // Simulate API delay
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

    setIsProcessingPayment(true);
    setErrorMsg('');

    let orderId: number | null = null;

    try {
      // 1. Save Order to Supabase
      if (supabase) {
        const itemsSummary = cart.map(item => `${item.MODEL} ${item.VARIANT} - ${item.POSITION} (x${item.QUANTITY})`).join(', ');
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
            billDescription: `Payment for ${cart.length} items`,
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
             setShowPaymentModal(true); // Fallback
         }
      } else {
        setShowPaymentModal(true); // Simulator
      }

    } catch (err) {
      setErrorMsg("Payment processing failed.");
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const finalizeMockPayment = (success: boolean) => {
    setShowPaymentModal(false);
    if (success && selectedCourier) {
      setOrderSuccess({
        billCode: 'TP-MOCK-' + Math.floor(Math.random() * 100000),
        transactionId: 'TXN-' + Date.now(),
        amount: finalTotal,
        date: new Date().toLocaleString(),
        items: [...cart],
        customer: { ...customer },
        shipping: { courier: selectedCourier.courier_name, type: selectedCourier.service_type, cost: selectedCourier.price }
      });
      setCart([]);
      
      // Decrease Stock in DB if Success (Mock)
      if (supabase && isAdmin) {
          cart.forEach(item => {
              const current = stockLevels[item.CODE] || 0;
              updateStock(item.CODE, Math.max(0, current - 1));
          });
      }
    }
  };

  const resetShop = () => {
    setOrderSuccess(null);
    setIsCheckout(false);
    setCart([]);
    setCustomer({ name: '', email: '', phone: '', address: '', postcode: '' });
    setAvailableCouriers([]);
    setSelectedCourier(null);
    // Refresh stock
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
             <button onClick={resetShop} className="w-full bg-blue-900 text-white py-3 rounded-xl font-bold hover:bg-blue-800">
                Back to Store
             </button>
        </div>
      </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 text-slate-800 font-sans pb-20">
      {/* Header */}
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

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 py-8">
        {!isCheckout ? (
          <div className="space-y-8">
            {/* Model Selection */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 grid md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Car Model</label>
                <select className="w-full p-3 border rounded-lg" value={selectedModel} onChange={(e) => { setSelectedModel(e.target.value); setSelectedVariant(''); }}>
                  <option value="">Select a Model</option>
                  {modelList.map(m => <option key={m} value={m}>{m}</option>)}
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

            {/* Products */}
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
          /* Checkout Layout (Simplified for brevity as logic mostly unchanged) */
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
                {cart.map(i => <div key={i.cartId} className="flex justify-between text-sm mb-2"><span>{i.MODEL}</span><span>RM {i.PRICE}</span></div>)}
                <div className="border-t pt-2 mt-2 font-bold flex justify-between"><span>Total</span><span>RM {finalTotal.toFixed(2)}</span></div>
                {errorMsg && <div className="text-red-500 text-sm mt-2">{errorMsg}</div>}
                <button onClick={initiatePayment} disabled={isProcessingPayment || !selectedCourier} className="w-full bg-blue-600 text-white py-3 rounded-xl mt-4 font-bold disabled:opacity-50">
                    {isProcessingPayment ? "Processing..." : "Pay Now"}
                </button>
            </div>
          </div>
        )}
      </main>
      
      {/* Footer Admin Login */}
      <footer className="bg-white border-t py-8 mt-12">
          <div className="max-w-5xl mx-auto px-4 text-center">
              <p className="text-gray-400 text-sm mb-4">&copy; 2024 Proride Parts Store. All rights reserved.</p>
              {!isAdmin ? (
                  <button onClick={() => setShowAdminLogin(true)} className="text-gray-300 hover:text-gray-500 text-xs flex items-center justify-center gap-1 mx-auto">
                      <Lock className="w-3 h-3" /> Staff Access
                  </button>
              ) : (
                  <div className="flex gap-4 justify-center">
                    <div className="text-green-600 text-xs font-bold flex items-center gap-1"><Check className="w-3 h-3"/> Admin Mode Active</div>
                    <button onClick={() => fetchStock()} className="text-blue-600 text-xs flex items-center gap-1 hover:underline"><RefreshCw className="w-3 h-3"/> Refresh Stock</button>
                    <button onClick={() => setIsAdmin(false)} className="text-red-400 text-xs hover:text-red-600">Logout</button>
                  </div>
              )}
          </div>
      </footer>

      {/* Admin Login Modal */}
      {showAdminLogin && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
              <div className="bg-white p-6 rounded-xl shadow-xl w-full max-w-sm">
                  <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><LogIn className="w-5 h-5"/> Staff Login</h3>
                  <form onSubmit={handleAdminLogin}>
                      <input 
                        type="password" 
                        className="w-full border p-2 rounded mb-4" 
                        placeholder="Enter admin password" 
                        value={adminPass}
                        onChange={e => setAdminPass(e.target.value)}
                        autoFocus
                      />
                      <div className="flex justify-end gap-2">
                          <button type="button" onClick={() => setShowAdminLogin(false)} className="px-4 py-2 text-gray-500">Cancel</button>
                          <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Login</button>
                      </div>
                  </form>
              </div>
          </div>
      )}

      {/* Cart Modal */}
      {isCartOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setIsCartOpen(false)} />
          <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col p-4">
            <div className="flex justify-between items-center mb-4"><h2 className="font-bold text-lg">Cart</h2><button onClick={() => setIsCartOpen(false)}><X/></button></div>
            <div className="flex-1 overflow-auto">{cart.map(c => <div key={c.cartId} className="border-b py-2 flex justify-between"><div>{c.MODEL} {c.VARIANT}</div><button onClick={() => removeFromCart(c.cartId)} className="text-red-500"><X className="w-4 h-4"/></button></div>)}</div>
            <button onClick={() => { setIsCartOpen(false); setIsCheckout(true); }} disabled={!cart.length} className="w-full bg-blue-900 text-white py-3 rounded-xl font-bold mt-4 disabled:opacity-50">Checkout</button>
          </div>
        </div>
      )}
      
      {/* Mock Payment Modal (Fallback) */}
      {showPaymentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white p-6 rounded-xl shadow-xl max-w-sm w-full">
                <h3 className="font-bold text-lg mb-2">Payment Simulator</h3>
                <p className="text-sm text-gray-500 mb-4">ToyyibPay keys missing or API blocked.</p>
                <button onClick={() => finalizeMockPayment(true)} className="w-full bg-green-600 text-white py-2 rounded mb-2">Simulate Success</button>
                <button onClick={() => finalizeMockPayment(false)} className="w-full border py-2 rounded">Cancel</button>
            </div>
        </div>
      )}
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
