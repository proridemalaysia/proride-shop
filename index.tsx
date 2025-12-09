
import React, { useState, useEffect, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { ShoppingCart, Truck, CreditCard, Check, X, Loader2, Package, Ship, Plane, FileText, Printer, ExternalLink, AlertCircle, Settings, Database, AlertTriangle, Lock } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
import { products, models, images } from './data';

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
  etd: string; // Estimated time of delivery
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

// Weight Logic based on prompt
const getProductWeight = (product: Product): number => {
  // Priority: Sport Spring variant is 8kg
  if (product.VARIANT === 'SPORT SPRING') return 8;
  
  // Position based weights
  if (product.POSITION === 'FRONT') return 10;
  if (product.POSITION === 'REAR') return 5;
  if (product.POSITION === '1SET') return 15;
  
  return 5; // Default fallback
};

// Get Malaysia Time ISO String (YYYY-MM-DDTHH:mm:ss)
const getMalaysiaTime = () => {
    const now = new Date();
    // Offset for UTC+8 is 480 minutes
    const offset = 8 * 60; 
    const localTime = new Date(now.getTime() + (offset * 60 * 1000));
    return localTime.toISOString().replace('Z', '');
};

// Styling Helper based on Variant
const getVariantStyles = (variant: string) => {
  const v = variant.toUpperCase();
  switch (v) {
    case 'STANDARD':
      return {
        header: 'bg-black text-white',
        button: 'bg-black hover:bg-gray-800 text-white',
        price: 'text-gray-900'
      };
    case 'HEAVY DUTY':
      return {
        header: 'bg-[#800000] text-white', // Maroon
        button: 'bg-[#800000] hover:bg-[#600000] text-white',
        price: 'text-[#800000]'
      };
    case 'PERFORMANCE':
      return {
        header: 'bg-yellow-400 text-black',
        button: 'bg-yellow-400 hover:bg-yellow-500 text-black',
        price: 'text-yellow-600'
      };
    case 'SPORT SPRING':
      return {
        header: 'bg-red-600 text-white',
        button: 'bg-red-600 hover:bg-red-700 text-white',
        price: 'text-red-600'
      };
    default:
      return {
        header: 'bg-blue-900 text-white',
        button: 'bg-blue-600 hover:bg-blue-700 text-white',
        price: 'text-blue-600'
      };
  }
};

// --- Components ---

const App = () => {
  // State: Selection
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [selectedVariant, setSelectedVariant] = useState<string>('');
  
  // State: Stock Simulation
  const [stockLevels, setStockLevels] = useState<Record<string, number>>({});

  // State: Cart & UI
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isCheckout, setIsCheckout] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState<OrderReceipt | null>(null);
  
  // State: Config (Supabase + ToyyibPay)
  const [showSettings, setShowSettings] = useState(false);
  const [appConfig, setAppConfig] = useState({ 
    supabaseUrl: '', 
    supabaseKey: '',
    toyyibSecretKey: '',
    toyyibCategoryCode: ''
  });
  const [isSupabaseConnected, setIsSupabaseConnected] = useState(false);

  // State: Checkout Form
  const [customer, setCustomer] = useState<CustomerDetails>({
    name: '',
    email: '',
    phone: '',
    address: '',
    postcode: ''
  });

  // State: Shipping & Payment
  const [availableCouriers, setAvailableCouriers] = useState<ShippingOption[]>([]);
  const [selectedCourier, setSelectedCourier] = useState<ShippingOption | null>(null);
  const [isCalculatingShipping, setIsCalculatingShipping] = useState(false);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false); // Fallback Modal
  const [errorMsg, setErrorMsg] = useState('');

  // --- Effects ---
  
  // Initialize Mock Stock Data
  useEffect(() => {
    const mockStock: Record<string, number> = {};
    products.forEach(p => {
        const rand = Math.random();
        if (rand < 0.1) mockStock[p.CODE] = 0;
        else if (rand < 0.3) mockStock[p.CODE] = Math.floor(Math.random() * 2) + 1; 
        else mockStock[p.CODE] = Math.floor(Math.random() * 13) + 3;
    });
    setStockLevels(mockStock);
  }, []);

  // Load Config from local storage on mount
  useEffect(() => {
    const savedUrl = localStorage.getItem('supabase_url');
    const savedKey = localStorage.getItem('supabase_key');
    const savedToyyibSecret = localStorage.getItem('toyyib_secret');
    const savedToyyibCat = localStorage.getItem('toyyib_cat');

    setAppConfig({
        supabaseUrl: savedUrl || '',
        supabaseKey: savedKey || '',
        toyyibSecretKey: savedToyyibSecret || '',
        toyyibCategoryCode: savedToyyibCat || ''
    });

    if (savedUrl && savedKey) {
      setIsSupabaseConnected(true);
    }
  }, []);

  // --- Derived Data ---

  // Create Supabase Client Dynamically
  const supabase = useMemo(() => {
    if (appConfig.supabaseUrl && appConfig.supabaseKey) {
      try {
        return createClient(appConfig.supabaseUrl, appConfig.supabaseKey);
      } catch (e) {
        console.error("Invalid Supabase Config");
        return null;
      }
    }
    return null;
  }, [appConfig.supabaseUrl, appConfig.supabaseKey]);

  // Get unique list of models
  const modelList = useMemo(() => Object.keys(models), []);

  // Get available variants for selected model
  const availableVariants = useMemo(() => {
    if (!selectedModel) return [];
    const modelProducts = products.filter(p => p.MODEL === selectedModel);
    return Array.from(new Set(modelProducts.map(p => p.VARIANT)));
  }, [selectedModel]);

  // Filter products for display
  const displayedProducts = useMemo(() => {
    if (!selectedModel || !selectedVariant) return [];
    return products.filter(p => p.MODEL === selectedModel && p.VARIANT === selectedVariant);
  }, [selectedModel, selectedVariant]);

  // Get Image for current selection
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

  // Get Current Styles
  const variantStyles = useMemo(() => getVariantStyles(selectedVariant), [selectedVariant]);

  // Totals
  const subtotal = cart.reduce((sum, item) => sum + item.PRICE, 0);
  const totalWeight = cart.reduce((sum, item) => sum + getProductWeight(item), 0);
  const finalTotal = subtotal + (selectedCourier ? selectedCourier.price : 0);

  // --- Handlers ---

  const addToCart = (product: Product) => {
    // Check Availability
    const currentStock = stockLevels[product.CODE] ?? 0;
    if (currentStock <= 0) return;

    // Add to Cart
    setCart([...cart, { ...product, cartId: Math.random().toString(36).substr(2, 9) }]);
    
    // Decrement Stock
    setStockLevels(prev => ({
        ...prev,
        [product.CODE]: Math.max(0, (prev[product.CODE] || 0) - 1)
    }));

    setIsCartOpen(true);
  };

  const removeFromCart = (cartId: string) => {
    const itemToRemove = cart.find(item => item.cartId === cartId);
    
    // Restore Stock
    if (itemToRemove) {
        setStockLevels(prev => ({
            ...prev,
            [itemToRemove.CODE]: (prev[itemToRemove.CODE] || 0) + 1
        }));
    }

    setCart(cart.filter(item => item.cartId !== cartId));
    // Reset shipping if cart changes
    setAvailableCouriers([]);
    setSelectedCourier(null);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setCustomer({ ...customer, [e.target.name]: e.target.value });
    // Reset shipping if postcode changes significantly
    if (e.target.name === 'postcode') {
        setAvailableCouriers([]);
        setSelectedCourier(null);
    }
  };

  const saveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem('supabase_url', appConfig.supabaseUrl);
    localStorage.setItem('supabase_key', appConfig.supabaseKey);
    localStorage.setItem('toyyib_secret', appConfig.toyyibSecretKey);
    localStorage.setItem('toyyib_cat', appConfig.toyyibCategoryCode);

    setIsSupabaseConnected(!!(appConfig.supabaseUrl && appConfig.supabaseKey));
    setShowSettings(false);
  };

  // --- API Integrations ---

  const calculateShipping = async () => {
    if (!customer.postcode) {
      setErrorMsg("Please enter a postcode.");
      return;
    }
    if (customer.postcode.length !== 5 || isNaN(parseInt(customer.postcode))) {
      setErrorMsg("Please enter a valid 5-digit postcode.");
      return;
    }
    if (cart.length === 0) {
      setErrorMsg("Cart is empty.");
      return;
    }

    setIsCalculatingShipping(true);
    setErrorMsg('');
    setAvailableCouriers([]);
    setSelectedCourier(null);

    try {
      // Mock Logic for Demo
      await new Promise(r => setTimeout(r, 1000));
      
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
      console.error("Shipping Error", err);
      setErrorMsg("Could not calculate shipping. Please try again.");
    } finally {
      setIsCalculatingShipping(false);
    }
  };

  // REAL TOYYIBPAY PAYMENT FLOW
  const initiatePayment = async () => {
    if (!customer.name || !customer.email || !customer.phone || !customer.address) {
      setErrorMsg("Please fill in all details.");
      return;
    }
    if (!selectedCourier) {
      setErrorMsg("Please select a courier.");
      return;
    }

    setIsProcessingPayment(true);
    setErrorMsg('');

    let orderId: number | null = null;

    try {
      // 1. Save to Supabase (Pending Payment)
      if (supabase && isSupabaseConnected) {
        
        const itemsSummary = cart.map(item => 
            `${item.MODEL} ${item.VARIANT} - ${item.POSITION} (x${item.QUANTITY})`
        ).join(', ');

        const malaysiaTime = getMalaysiaTime();

        const { data, error: dbError } = await supabase
          .from('orders')
          .insert([
            {
              created_at: malaysiaTime,
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
            }
          ])
          .select('id')
          .single();
        
        if (dbError) {
            console.error("Supabase Error", dbError);
            throw new Error("Failed to save order to database.");
        }
        if (data) orderId = data.id;
      }

      // 2. Handle ToyyibPay
      // If Secret Key and Category Code are provided, try Real API
      if (appConfig.toyyibSecretKey && appConfig.toyyibCategoryCode) {
         
         const formBody = new URLSearchParams({
            userSecretKey: appConfig.toyyibSecretKey,
            categoryCode: appConfig.toyyibCategoryCode,
            billName: `Proride Auto Parts - Order #${orderId || 'New'}`,
            billDescription: `Payment for ${cart.length} items. Courier: ${selectedCourier.courier_name}`,
            billPriceSetting: '1',
            billPayorInfo: '1',
            billAmount: (finalTotal * 100).toFixed(0), // Amount in cents
            billReturnUrl: window.location.href, // Returns to this page
            billCallbackUrl: window.location.href, // Ideally a backend webhook
            billTo: customer.name,
            billEmail: customer.email,
            billPhone: customer.phone,
            billSplitPayment: '0',
            billSplitPaymentArgs: '',
            billPaymentChannel: '0',
            billContentEmail: 'Thank you for purchasing form Proride Parts.',
            billChargeToCustomer: '1'
         });

         // NOTE: ToyyibPay API often blocks direct browser calls (CORS).
         // Ideally this fetch runs on a server (Supabase Edge Function).
         try {
             const response = await fetch('https://toyyibpay.com/index.php/api/createBill', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: formBody
             });
             
             const result = await response.json();
             
             if (result && result[0] && result[0].BillCode) {
                 // REDIRECT TO PAYMENT GATEWAY
                 window.location.href = `https://toyyibpay.com/${result[0].BillCode}`;
                 return; // Stop execution here as page redirects
             } else {
                 console.error("ToyyibPay Error", result);
                 throw new Error("Could not create bill. Check API Keys.");
             }
         } catch (fetchErr) {
             console.error("CORS/Fetch Error", fetchErr);
             // If Fetch fails (likely CORS), we fall back to the Simulator modal for the User
             // but warn them.
             alert("Direct API call failed (likely CORS). For live production, you must use a Backend Proxy or Supabase Edge Function to call ToyyibPay. Opening simulator for now.");
             setShowPaymentModal(true);
         }

      } else {
        // Fallback to Simulation if keys missing
        console.log("No ToyyibPay keys provided. Using Simulation.");
        await new Promise(r => setTimeout(r, 1000));
        setShowPaymentModal(true);
      }

    } catch (err) {
      console.error("Payment Error", err);
      setErrorMsg("Processing failed: " + (err as Error).message);
    } finally {
      setIsProcessingPayment(false);
    }
  };

  // Step 2: Finalize Payment (Simulator Logic)
  const finalizeMockPayment = async (success: boolean) => {
    setShowPaymentModal(false);

    if (success && selectedCourier) {
      const mockReceipt: OrderReceipt = {
        billCode: 'TP-MOCK-' + Math.floor(Math.random() * 100000),
        transactionId: 'TXN-' + Date.now(),
        amount: finalTotal,
        date: new Date().toLocaleString(),
        items: [...cart],
        customer: { ...customer },
        shipping: {
          courier: selectedCourier.courier_name,
          type: selectedCourier.service_type,
          cost: selectedCourier.price
        }
      };

      setCart([]);
      setOrderSuccess(mockReceipt);
    } else {
      setErrorMsg("Payment was cancelled by user.");
    }
  };

  const resetShop = () => {
    if (!orderSuccess && cart.length > 0) {
        setStockLevels(prev => {
            const restored = { ...prev };
            cart.forEach(item => {
                restored[item.CODE] = (restored[item.CODE] || 0) + 1;
            });
            return restored;
        });
    }

    setOrderSuccess(null);
    setIsCheckout(false);
    setSelectedModel('');
    setSelectedVariant('');
    setCart([]);
    setCustomer({ name: '', email: '', phone: '', address: '', postcode: '' });
    setAvailableCouriers([]);
    setSelectedCourier(null);
  }

  // View: Order Success Receipt
  if (orderSuccess) {
    return (
      <div className="min-h-screen bg-gray-50 p-4 md:p-8 font-sans">
        <div className="max-w-2xl mx-auto bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden animate-fade-in">
          <div className="bg-green-600 text-white p-6 text-center">
            <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold">Payment Successful!</h1>
            <p className="opacity-90 mt-1">Thank you for your order, {orderSuccess.customer.name.split(' ')[0]}.</p>
          </div>
          
          <div className="p-6 md:p-8 space-y-6">
            <div className="flex justify-between items-center border-b pb-4">
              <div>
                <div className="text-xs text-gray-500 uppercase tracking-wide">Bill Code</div>
                <div className="font-mono font-bold text-gray-800">{orderSuccess.billCode}</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-gray-500 uppercase tracking-wide">Date</div>
                <div className="font-medium text-gray-800">{orderSuccess.date.split(',')[0]}</div>
              </div>
            </div>

            {/* Items */}
            <div className="space-y-3">
              <h3 className="font-bold text-gray-800 flex items-center gap-2">
                <Package className="w-4 h-4 text-gray-500" /> Purchased Items
              </h3>
              <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                {orderSuccess.items.map((item, idx) => (
                  <div key={idx} className="flex justify-between text-sm">
                     <span>{item.MODEL} - {item.VARIANT} ({item.POSITION})</span>
                     <span className="font-mono">RM {item.PRICE.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Shipping Info */}
            <div className="grid grid-cols-2 gap-4">
               <div>
                  <h3 className="font-bold text-gray-800 flex items-center gap-2 mb-2">
                    <Truck className="w-4 h-4 text-gray-500" /> Shipping
                  </h3>
                  <div className="text-sm text-gray-600">
                    <div className="font-medium text-blue-900">{orderSuccess.shipping.courier}</div>
                    <div>{orderSuccess.shipping.type} Freight</div>
                    <div className="text-xs mt-1 max-w-[150px]">{orderSuccess.customer.address}</div>
                    <div className="font-bold mt-1">{orderSuccess.customer.postcode}</div>
                  </div>
               </div>
               <div className="text-right">
                  <h3 className="font-bold text-gray-800 mb-2">Amount Paid</h3>
                  <div className="text-3xl font-bold text-green-600">RM {orderSuccess.amount.toFixed(2)}</div>
                  <div className="text-xs text-gray-400 mt-1">Via ToyyibPay</div>
               </div>
            </div>

            <div className="flex gap-3 pt-4">
              <button onClick={() => window.print()} className="flex-1 border border-gray-300 text-gray-700 py-3 rounded-xl font-bold hover:bg-gray-50 flex items-center justify-center gap-2">
                <Printer className="w-4 h-4" /> Print Receipt
              </button>
              <button onClick={resetShop} className="flex-1 bg-blue-900 text-white py-3 rounded-xl font-bold hover:bg-blue-800">
                Continue Shopping
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 text-slate-800 font-sans">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-blue-900 tracking-tight cursor-pointer" onClick={resetShop}>Proride Parts</h1>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setShowSettings(true)}
              className={`p-2 rounded-full transition-colors ${isSupabaseConnected ? 'text-green-600 bg-green-50 hover:bg-green-100' : 'text-gray-400 hover:text-gray-600'}`}
              title="Settings"
            >
              <Settings className="w-6 h-6" />
            </button>
            <button 
              onClick={() => setIsCartOpen(true)}
              className="relative p-2 text-gray-600 hover:text-blue-600 transition-colors"
            >
              <ShoppingCart className="w-6 h-6" />
              {cart.length > 0 && (
                <span className="absolute top-0 right-0 bg-red-500 text-white text-xs font-bold w-5 h-5 flex items-center justify-center rounded-full">
                  {cart.length}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 py-8">
        {!isCheckout ? (
          <div className="space-y-8">
            {/* Filter Section */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 grid md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Car Model</label>
                <select 
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  value={selectedModel}
                  onChange={(e) => { setSelectedModel(e.target.value); setSelectedVariant(''); }}
                >
                  <option value="">Select a Model</option>
                  {modelList.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Product Type</label>
                <select 
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none disabled:opacity-50"
                  value={selectedVariant}
                  onChange={(e) => setSelectedVariant(e.target.value)}
                  disabled={!selectedModel}
                >
                  <option value="">Select Variant</option>
                  {availableVariants.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
            </div>

            {/* Product Display Area */}
            {selectedModel && selectedVariant && (
              <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden animate-fade-in">
                {/* Dynamic Header Color */}
                <div className={`${variantStyles.header} p-4 text-center transition-colors duration-300`}>
                  <h2 className="text-xl font-bold">{selectedModel} - {selectedVariant}</h2>
                </div>
                
                <div className="grid md:grid-cols-2 gap-0">
                  {/* Left: Image */}
                  <div className="p-8 bg-gray-50 flex items-center justify-center border-b md:border-b-0 md:border-r border-gray-100">
                    {currentImage && (
                      <img 
                        src={currentImage} 
                        alt={`${selectedModel} ${selectedVariant}`} 
                        className="max-w-full max-h-80 object-contain drop-shadow-md hover:scale-105 transition-transform duration-300"
                      />
                    )}
                  </div>

                  {/* Right: SKU List */}
                  <div className="p-6 space-y-4">
                    <h3 className="text-gray-500 font-medium text-sm uppercase tracking-wide mb-4">Available Components</h3>
                    {displayedProducts.map(product => {
                      // Get simulated stock data
                      const stock = stockLevels[product.CODE] ?? 0;
                      const isLowStock = stock < 3 && stock > 0;
                      const isOutOfStock = stock === 0;

                      return (
                        <div key={product.CODE} className="bg-white border border-gray-200 rounded-lg p-4 flex justify-between items-center hover:shadow-md transition-shadow">
                          <div>
                            <div className="font-bold text-gray-800">{product.POSITION === '1SET' ? 'FULL SET (4 pcs)' : `${product.POSITION} (${product.QUANTITY} pcs)`}</div>
                            <div className={`font-bold text-lg ${variantStyles.price}`}>RM {product.PRICE.toFixed(2)}</div>
                            <div className="text-xs text-gray-400 font-mono mt-1">{product.CODE} • {getProductWeight(product)}kg</div>
                            
                            {/* Stock Indicator */}
                            <div className="mt-2 flex items-center gap-2">
                                <span className={`text-xs font-semibold ${isOutOfStock ? 'text-red-500' : isLowStock ? 'text-orange-500' : 'text-green-600'}`}>
                                    {isOutOfStock ? 'Out of Stock' : `Available: ${stock}`}
                                </span>
                                {isLowStock && (
                                    <div className="flex items-center gap-1 bg-red-100 text-red-600 px-1.5 py-0.5 rounded text-[10px] font-bold border border-red-200 animate-pulse">
                                        <AlertTriangle className="w-3 h-3" /> Low Stock
                                    </div>
                                )}
                            </div>
                          </div>
                          
                          {/* Dynamic Button Color & State */}
                          <button 
                            onClick={() => addToCart(product)}
                            disabled={isOutOfStock}
                            className={`
                              ${variantStyles.button} 
                              px-5 py-2.5 rounded-lg font-medium transition-colors flex items-center gap-2
                              ${isOutOfStock ? 'opacity-50 cursor-not-allowed grayscale bg-gray-400 !hover:bg-gray-400 !text-white' : ''}
                            `}
                          >
                            {isOutOfStock ? 'No Stock' : (
                                <>Add <ShoppingCart className="w-4 h-4" /></>
                            )}
                          </button>
                        </div>
                      );
                    })}
                    {displayedProducts.length === 0 && (
                      <div className="text-center text-gray-500 py-4">No specific parts found for this configuration.</div>
                    )}
                  </div>
                </div>
              </div>
            )}
            
            {!selectedModel && (
              <div className="text-center py-20 bg-white rounded-xl border border-dashed border-gray-300">
                <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg text-gray-500 font-medium">Select a car model to browse parts</h3>
              </div>
            )}
          </div>
        ) : (
          // Checkout View
          <div className="grid lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              <button 
                onClick={() => setIsCheckout(false)}
                className="text-sm text-gray-500 hover:text-gray-800 flex items-center gap-1"
              >
                ← Back to Shop
              </button>
              
              {/* Customer Form */}
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm">1</div>
                  Shipping Details
                </h2>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                    <input 
                      type="text" name="name" 
                      value={customer.name} onChange={handleInputChange}
                      className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 outline-none" 
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <input 
                      type="email" name="email" 
                      value={customer.email} onChange={handleInputChange}
                      className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 outline-none" 
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                    <input 
                      type="tel" name="phone" 
                      value={customer.phone} onChange={handleInputChange}
                      className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 outline-none" 
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                    <textarea 
                      name="address" rows={3}
                      value={customer.address} onChange={handleInputChange}
                      className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 outline-none" 
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Postcode (Delivery)</label>
                    <input 
                      type="text" name="postcode" 
                      placeholder="e.g. 88000"
                      value={customer.postcode} onChange={handleInputChange}
                      className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 outline-none" 
                    />
                  </div>
                  <div className="flex items-end">
                    <button 
                      onClick={calculateShipping}
                      disabled={isCalculatingShipping || !customer.postcode}
                      className="w-full bg-slate-800 text-white p-2 rounded hover:bg-slate-700 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {isCalculatingShipping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Truck className="w-4 h-4" />}
                      Check Shipping Rates
                    </button>
                  </div>
                </div>

                {/* Courier Selection */}
                {availableCouriers.length > 0 && (
                  <div className="mt-8 pt-6 border-t animate-fade-in">
                    <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                       <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm">2</div>
                       Select Courier
                    </h3>
                    <div className="space-y-3">
                        {availableCouriers.map((courier) => (
                            <label 
                                key={courier.service_id} 
                                className={`flex items-center justify-between p-4 border rounded-lg cursor-pointer transition-all hover:bg-blue-50 ${selectedCourier?.service_id === courier.service_id ? 'border-blue-500 ring-1 ring-blue-500 bg-blue-50' : 'border-gray-200'}`}
                            >
                                <div className="flex items-center gap-4">
                                    <input 
                                        type="radio" 
                                        name="courier" 
                                        className="w-5 h-5 text-blue-600"
                                        checked={selectedCourier?.service_id === courier.service_id}
                                        onChange={() => setSelectedCourier(courier)}
                                    />
                                    <div>
                                        <div className="font-bold text-gray-800 flex items-center gap-2">
                                            {courier.courier_name}
                                            {courier.service_type === 'Sea' ? (
                                                <span className="bg-cyan-100 text-cyan-800 text-xs px-2 py-0.5 rounded flex items-center gap-1"><Ship className="w-3 h-3"/> Sea Freight</span>
                                            ) : courier.service_type === 'Air' ? (
                                                <span className="bg-sky-100 text-sky-800 text-xs px-2 py-0.5 rounded flex items-center gap-1"><Plane className="w-3 h-3"/> Air</span>
                                            ) : (
                                                <span className="bg-gray-100 text-gray-800 text-xs px-2 py-0.5 rounded">Standard</span>
                                            )}
                                        </div>
                                        <div className="text-xs text-gray-500">Est: {courier.etd}</div>
                                    </div>
                                </div>
                                <div className="font-bold text-blue-900">RM {courier.price.toFixed(2)}</div>
                            </label>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Order Summary Side */}
            <div className="space-y-6">
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 sticky top-24">
                <h2 className="text-xl font-bold mb-4">Order Summary</h2>
                <div className="space-y-3 mb-6 max-h-60 overflow-y-auto pr-2">
                  {cart.map((item) => (
                    <div key={item.cartId} className="flex justify-between text-sm">
                      <div className="flex-1">
                        <div className="font-medium">{item.MODEL}</div>
                        <div className="text-gray-500 text-xs">{item.VARIANT} - {item.POSITION}</div>
                      </div>
                      <div className="font-medium text-gray-700">RM {item.PRICE.toFixed(2)}</div>
                    </div>
                  ))}
                </div>
                
                <div className="border-t pt-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Subtotal</span>
                    <span className="font-medium">RM {subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Total Weight</span>
                    <span className="font-medium">{totalWeight} kg</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 flex flex-col">
                        <span>Shipping</span>
                        {selectedCourier && <span className="text-xs text-blue-600 font-semibold">{selectedCourier.courier_name}</span>}
                    </span>
                    <span className="font-medium">
                      {selectedCourier ? `RM ${selectedCourier.price.toFixed(2)}` : '---'}
                    </span>
                  </div>
                  
                  <div className="flex justify-between text-lg font-bold text-blue-900 border-t pt-2 mt-2">
                    <span>Total</span>
                    <span>RM {finalTotal.toFixed(2)}</span>
                  </div>
                </div>

                {errorMsg && (
                   <div className="mt-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg flex items-center gap-2">
                     <AlertCircle className="w-4 h-4 shrink-0" /> {errorMsg}
                   </div>
                )}

                <button 
                  onClick={initiatePayment}
                  disabled={isProcessingPayment || !selectedCourier}
                  className="w-full mt-6 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-bold text-lg shadow-lg shadow-blue-200 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:shadow-none"
                >
                  {isProcessingPayment ? <Loader2 className="w-5 h-5 animate-spin" /> : <CreditCard className="w-5 h-5" />}
                  Proceed to Payment
                </button>
                <div className="text-xs text-center text-gray-400 mt-3 flex items-center justify-center gap-2">
                  {isSupabaseConnected ? (
                    <span className="text-green-600 flex items-center gap-1"><Database className="w-3 h-3"/> DB Connected</span>
                  ) : (
                     "No Database"
                  )}
                  <span className="text-gray-300">|</span>
                  {appConfig.toyyibSecretKey ? (
                    <span className="text-green-600 flex items-center gap-1"><Lock className="w-3 h-3"/> Payment Active</span>
                  ) : (
                    "Simulator Mode"
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Settings Modal (Config) */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
           <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowSettings(false)} />
           <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-fade-in max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-start mb-6">
                 <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                    <Settings className="w-5 h-5 text-blue-600" />
                    App Configuration
                 </h3>
                 <button onClick={() => setShowSettings(false)} className="text-gray-400 hover:text-gray-600">
                    <X className="w-5 h-5" />
                 </button>
              </div>

              <form onSubmit={saveSettings} className="space-y-4">
                  <div className="text-sm text-gray-600 mb-4 bg-blue-50 p-3 rounded-lg">
                      Settings are saved locally in your browser. Use this to connect your real backend services.
                  </div>
                  
                  {/* Supabase Section */}
                  <div className="border-b pb-4">
                      <h4 className="font-bold text-gray-800 mb-3 flex items-center gap-2"><Database className="w-4 h-4"/> Database (Supabase)</h4>
                      <div className="space-y-3">
                        <div>
                            <label className="block text-xs font-bold text-gray-600 mb-1 uppercase">Supabase URL</label>
                            <input 
                                type="text" 
                                placeholder="https://xyz.supabase.co"
                                className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                                value={appConfig.supabaseUrl}
                                onChange={(e) => setAppConfig({...appConfig, supabaseUrl: e.target.value})}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-600 mb-1 uppercase">Supabase Anon Key</label>
                            <input 
                                type="password" 
                                placeholder="eyJh..."
                                className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                                value={appConfig.supabaseKey}
                                onChange={(e) => setAppConfig({...appConfig, supabaseKey: e.target.value})}
                            />
                        </div>
                      </div>
                  </div>

                  {/* ToyyibPay Section */}
                  <div>
                      <h4 className="font-bold text-gray-800 mb-3 flex items-center gap-2"><CreditCard className="w-4 h-4"/> Payment (ToyyibPay)</h4>
                      <div className="space-y-3">
                        <div>
                            <label className="block text-xs font-bold text-gray-600 mb-1 uppercase">Secret Key</label>
                            <input 
                                type="text" 
                                placeholder="e.g. 7d8f... (from ToyyibPay Dashboard)"
                                className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                                value={appConfig.toyyibSecretKey}
                                onChange={(e) => setAppConfig({...appConfig, toyyibSecretKey: e.target.value})}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-600 mb-1 uppercase">Category Code</label>
                            <input 
                                type="text" 
                                placeholder="e.g. 5p8s..."
                                className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                                value={appConfig.toyyibCategoryCode}
                                onChange={(e) => setAppConfig({...appConfig, toyyibCategoryCode: e.target.value})}
                            />
                        </div>
                      </div>
                  </div>

                  <button 
                      type="submit"
                      className="w-full bg-blue-600 text-white py-2 rounded-lg font-bold hover:bg-blue-700 mt-2"
                  >
                      Save Configuration
                  </button>
              </form>
           </div>
        </div>
      )}

      {/* Mock Modal (Only shows if no ToyyibKeys or API Fails) */}
      {showPaymentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
           <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => finalizeMockPayment(false)} />
           <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-fade-in">
              <div className="flex justify-between items-start mb-4">
                 <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                    <ExternalLink className="w-5 h-5 text-blue-600" />
                    Payment Gateway (Simulator)
                 </h3>
                 <button onClick={() => finalizeMockPayment(false)} className="text-gray-400 hover:text-gray-600">
                    <X className="w-5 h-5" />
                 </button>
              </div>
              
              <div className="bg-orange-50 p-4 rounded-lg border border-orange-200 mb-6 text-sm text-orange-800">
                 <strong>Note:</strong> You are seeing this because no valid ToyyibPay keys were found in Settings, or the direct API call was blocked by your browser.
              </div>
              
              <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 mb-6">
                 <div className="text-sm text-gray-500 mb-1">Merchant</div>
                 <div className="font-bold text-gray-800 mb-3">Proride Parts Store</div>
                 <div className="text-sm text-gray-500 mb-1">Amount</div>
                 <div className="text-2xl font-bold text-blue-600">RM {finalTotal.toFixed(2)}</div>
              </div>

              <div className="space-y-3">
                 <button 
                    onClick={() => finalizeMockPayment(true)}
                    className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-xl shadow-lg shadow-green-200 flex items-center justify-center gap-2 transition-transform active:scale-95"
                 >
                    <Check className="w-5 h-5" /> Simulate Success
                 </button>
                 <button 
                    onClick={() => finalizeMockPayment(false)}
                    className="w-full bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-medium py-3 rounded-xl flex items-center justify-center gap-2"
                 >
                    Cancel Transaction
                 </button>
              </div>
           </div>
        </div>
      )}

      {/* Cart Sidebar/Modal */}
      {isCartOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setIsCartOpen(false)} />
          <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col animate-slide-in">
            <div className="p-4 border-b flex items-center justify-between bg-gray-50">
              <h2 className="font-bold text-lg flex items-center gap-2">
                <ShoppingCart className="w-5 h-5" /> Your Cart
              </h2>
              <button onClick={() => setIsCartOpen(false)} className="p-2 hover:bg-gray-200 rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {cart.length === 0 ? (
                <div className="text-center py-10 text-gray-500">Your cart is empty.</div>
              ) : (
                cart.map((item) => (
                  <div key={item.cartId} className="flex gap-4 p-3 bg-white border rounded-lg shadow-sm">
                    <div className="flex-1">
                      <div className="text-xs font-bold text-blue-600">{item.MODEL}</div>
                      <div className="font-medium text-gray-800">{item.VARIANT}</div>
                      <div className="text-sm text-gray-500">{item.POSITION}</div>
                      <div className="mt-1 font-bold text-gray-900">RM {item.PRICE.toFixed(2)}</div>
                    </div>
                    <button 
                      onClick={() => removeFromCart(item.cartId)}
                      className="text-red-400 hover:text-red-600 self-start p-1"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="p-4 border-t bg-gray-50">
              <div className="flex justify-between font-bold text-lg mb-4">
                <span>Subtotal</span>
                <span>RM {subtotal.toFixed(2)}</span>
              </div>
              <button 
                onClick={() => { setIsCartOpen(false); setIsCheckout(true); }}
                disabled={cart.length === 0}
                className="w-full bg-blue-900 text-white py-3 rounded-xl font-medium hover:bg-blue-800 disabled:opacity-50 transition-colors"
              >
                Checkout
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
