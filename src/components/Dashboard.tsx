import { useState, useEffect, useMemo } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, 
  AreaChart, Area, ReferenceLine, ComposedChart, Bar, Cell 
} from 'recharts';
import { 
  Battery, Zap, TrendingUp, IndianRupee, Sun, Moon, 
  ArrowUpRight, ArrowDownLeft, Settings, AlertTriangle, MapPin, History, Car, Plug
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { generateDailyProfile, SIMULATION_CONFIG, EVConfig, DEFAULT_EV_CONFIG } from '@/lib/simulation';
import { cn } from '@/lib/utils';
import HistoryView from './HistoryView';

const INDIAN_STATES = [
  { name: 'Maharashtra', tariff: 'MSEDCL' },
  { name: 'Karnataka', tariff: 'BESCOM' },
  { name: 'Delhi', tariff: 'BSES' },
  { name: 'Gujarat', tariff: 'GUVNL' },
];

export default function Dashboard() {
  const [data, setData] = useState(() => generateDailyProfile());
  const [currentData, setCurrentData] = useState(data[0]);
  const [isSimulating, setIsSimulating] = useState(true);
  const [selectedState, setSelectedState] = useState(INDIAN_STATES[0]);
  const [cumulativeSavings, setCumulativeSavings] = useState(0);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected'>('connected');
  const [view, setView] = useState<'dashboard' | 'history'>('dashboard');
  const [evConfig, setEvConfig] = useState<EVConfig>(DEFAULT_EV_CONFIG);

  // Fetch data from API
  useEffect(() => {
    if (!isSimulating || view === 'history') return;

    const fetchData = async () => {
      try {
        const response = await fetch('/api/grid-data');
        if (!response.ok) throw new Error('Network response was not ok');
        
        const result = await response.json();
        setCurrentData(result.current);
        setData(result.forecast);
        if (result.evConfig) setEvConfig(result.evConfig);
        setConnectionStatus('connected');
        
        // Reset cumulative savings if it's a new day (index 0)
        if (result.currentIndex === 0) {
           setCumulativeSavings(0);
        }
      } catch (error) {
        console.error('Failed to fetch grid data:', error);
        setConnectionStatus('disconnected');
      }
    };

    // Initial fetch
    fetchData();

    // Poll every 2 seconds
    const interval = setInterval(fetchData, 2000);

    return () => clearInterval(interval);
  }, [isSimulating, view]);

  const updateEvConfig = async (newConfig: Partial<EVConfig>) => {
    try {
      const updated = { ...evConfig, ...newConfig };
      setEvConfig(updated); // Optimistic update
      
      await fetch('/api/ev-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
    } catch (err) {
      console.error("Failed to update EV config", err);
    }
  };
  
  // Calculate cumulative savings effect
  useEffect(() => {
    if (currentData.action === 'Discharging' && currentData.price > SIMULATION_CONFIG.HIGH_PRICE_THRESHOLD) {
      // Selling high
      const profit = (currentData.price - SIMULATION_CONFIG.LOW_PRICE_THRESHOLD) * 2; // Assume 2kWh traded
      setCumulativeSavings(prev => prev + profit);
    }
  }, [currentData]);

  // Calculate projected daily savings (static)
  const projectedDailySavings = useMemo(() => {
    return data.reduce((acc, point) => {
      if (point.action === 'Discharging' && point.price > SIMULATION_CONFIG.HIGH_PRICE_THRESHOLD) {
        return acc + (point.price - SIMULATION_CONFIG.LOW_PRICE_THRESHOLD) * 2;
      }
      return acc;
    }, 0);
  }, [data]);

  if (view === 'history') {
    return <HistoryView onBack={() => setView('dashboard')} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans">
      {/* Header */}
      <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
            <Zap className="h-8 w-8 text-yellow-500 fill-yellow-500" />
            SmartGrid India
          </h1>
          <p className="text-slate-500 mt-1">
            Intelligent Energy Arbitrage Controller • <span className="font-mono text-xs bg-slate-200 px-2 py-0.5 rounded">v1.0.0-beta</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          {/* History Button */}
          <button
            onClick={() => setView('history')}
            className="flex items-center gap-2 bg-white px-3 py-2 rounded-lg border border-slate-200 shadow-sm hover:bg-slate-50 text-slate-700 font-medium text-sm transition-colors"
          >
            <History className="h-4 w-4" />
            History
          </button>

          {/* State Selector */}
          <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-lg border border-slate-200 shadow-sm">
            <MapPin className="h-4 w-4 text-slate-400" />
            <select 
              className="bg-transparent text-sm font-medium text-slate-700 outline-none cursor-pointer"
              value={selectedState.name}
              onChange={(e) => {
                const state = INDIAN_STATES.find(s => s.name === e.target.value);
                if (state) setSelectedState(state);
                // In a real app, this would trigger a re-generation of data with state-specific tariffs
                setData(generateDailyProfile()); 
                setCumulativeSavings(0);
                setCurrentTimeIndex(0);
              }}
            >
              {INDIAN_STATES.map(s => (
                <option key={s.name} value={s.name}>{s.name} ({s.tariff})</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-4 bg-white p-2 rounded-lg shadow-sm border border-slate-200">
            <div className="text-right px-2">
              <p className="text-xs text-slate-400 uppercase font-semibold flex items-center justify-end gap-1">
                Simulation Time
                <span className={cn("h-2 w-2 rounded-full", connectionStatus === 'connected' ? "bg-green-500" : "bg-red-500")} title={connectionStatus === 'connected' ? "Connected to Grid API" : "Disconnected"} />
              </p>
              <p className="text-xl font-mono font-bold text-slate-700 w-16 text-center">
                {currentData.time}
              </p>
            </div>
            <button 
              onClick={() => setIsSimulating(!isSimulating)}
              className={cn(
                "px-4 py-2 rounded-md font-medium text-sm transition-colors",
                isSimulating 
                  ? "bg-amber-100 text-amber-700 hover:bg-amber-200" 
                  : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
              )}
            >
              {isSimulating ? 'Pause' : 'Resume'}
            </button>
          </div>
        </div>
      </header>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-8">
        {/* Current Price Card */}
        <Card className="border-l-4 border-l-blue-500 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <CardDescription>Grid Price (Real-Time)</CardDescription>
            <CardTitle className="text-2xl flex items-baseline gap-1">
              <IndianRupee className="h-5 w-5 text-slate-400" />
              {currentData.price.toFixed(2)}
              <span className="text-sm font-normal text-slate-500">/ kWh</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 text-sm">
              {currentData.price > SIMULATION_CONFIG.HIGH_PRICE_THRESHOLD ? (
                <span className="text-red-500 flex items-center font-medium bg-red-50 px-2 py-0.5 rounded-full">
                  <ArrowUpRight className="h-4 w-4 mr-1" /> Peak Rate
                </span>
              ) : currentData.price < SIMULATION_CONFIG.LOW_PRICE_THRESHOLD ? (
                <span className="text-emerald-500 flex items-center font-medium bg-emerald-50 px-2 py-0.5 rounded-full">
                  <ArrowDownLeft className="h-4 w-4 mr-1" /> Off-Peak Rate
                </span>
              ) : (
                <span className="text-slate-500 flex items-center bg-slate-100 px-2 py-0.5 rounded-full">
                  Standard Rate
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Battery Status Card */}
        <Card className={cn(
          "border-l-4 shadow-sm hover:shadow-md transition-all duration-500",
          currentData.batteryLevel < 20 ? "border-l-red-500" : "border-l-emerald-500"
        )}>
          <CardHeader className="pb-2">
            <CardDescription>Battery Storage</CardDescription>
            <CardTitle className="text-2xl flex items-baseline gap-1">
              {currentData.batteryLevel}%
              <span className="text-sm font-normal text-slate-500">
                ({((currentData.batteryLevel / 100) * SIMULATION_CONFIG.BATTERY_CAPACITY_KWH).toFixed(1)} kWh)
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="w-full bg-slate-100 rounded-full h-2.5 mb-2 overflow-hidden">
              <div 
                className={cn("h-2.5 rounded-full transition-all duration-500", 
                  currentData.batteryLevel < 20 ? "bg-red-500" : "bg-emerald-500"
                )} 
                style={{ width: `${currentData.batteryLevel}%` }}
              ></div>
            </div>
            <p className="text-xs text-slate-500 flex items-center gap-1">
              Status: 
              <span className={cn(
                "font-bold uppercase text-xs px-2 py-0.5 rounded-full",
                currentData.action === 'Charging' ? "bg-blue-100 text-blue-700" :
                currentData.action === 'Discharging' ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"
              )}>
                {currentData.action}
              </span>
            </p>
          </CardContent>
        </Card>

        {/* EV Status Card */}
        <Card className="border-l-4 border-l-blue-600 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <div>
              <CardDescription>EV Charging</CardDescription>
              <CardTitle className="text-2xl flex items-baseline gap-1">
                {currentData.evBatteryLevel ?? 0}%
              </CardTitle>
            </div>
            <Car className="h-8 w-8 text-blue-100" />
          </CardHeader>
          <CardContent>
            <div className="w-full bg-slate-100 rounded-full h-2.5 mb-2 overflow-hidden">
              <div 
                className={cn("h-2.5 rounded-full transition-all duration-500 bg-blue-500", 
                  currentData.evStatus === 'Charging' && "animate-pulse"
                )} 
                style={{ width: `${currentData.evBatteryLevel ?? 0}%` }}
              />
            </div>
            <div className="flex items-center justify-between mt-2">
              <span className={cn(
                "text-xs font-bold uppercase px-2 py-0.5 rounded-full",
                currentData.evStatus === 'Charging' ? "bg-green-100 text-green-700" : 
                currentData.evStatus === 'Connected' ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500"
              )}>
                {currentData.evStatus ?? 'Disconnected'}
              </span>
              <span className="text-xs text-slate-500">
                {currentData.evStatus === 'Charging' ? `${currentData.evLoad} kW` : 'Idle'}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Solar Generation Card */}
        <Card className="border-l-4 border-l-yellow-400 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <CardDescription>Solar Generation</CardDescription>
            <CardTitle className="text-2xl flex items-baseline gap-1">
              {currentData.solarGeneration.toFixed(1)}
              <span className="text-sm font-normal text-slate-500">kW</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 text-sm text-slate-500">
              {currentData.hour >= 6 && currentData.hour <= 18 ? (
                <span className="flex items-center text-yellow-700 bg-yellow-100 px-2 py-0.5 rounded-full font-medium">
                  <Sun className="h-4 w-4 mr-1" /> Active
                </span>
              ) : (
                <span className="flex items-center text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                  <Moon className="h-4 w-4 mr-1" /> Inactive
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Savings Card */}
        <Card className="border-l-4 border-l-indigo-500 bg-gradient-to-br from-indigo-50 to-white shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <CardDescription>Realized Savings (Today)</CardDescription>
            <CardTitle className="text-2xl flex items-baseline gap-1 text-indigo-700">
              <IndianRupee className="h-5 w-5" />
              {cumulativeSavings.toFixed(0)}
              <span className="text-sm font-normal text-slate-400 ml-1">
                / ₹{projectedDailySavings.toFixed(0)}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-indigo-600/80 font-medium">
              Arbitrage Profit Accumulating...
            </p>
          </CardContent>
        </Card>

        {/* Grid Frequency Card */}
        <Card className="border-l-4 border-l-purple-500 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <CardDescription>Grid Frequency</CardDescription>
            <CardTitle className="text-2xl flex items-baseline gap-1">
              {currentData.gridFrequency.toFixed(2)}
              <span className="text-sm font-normal text-slate-500">Hz</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 text-sm">
              {currentData.gridFrequency < 49.9 ? (
                <span className="text-red-500 flex items-center font-medium">
                  <AlertTriangle className="h-4 w-4 mr-1" /> Low (Stress)
                </span>
              ) : currentData.gridFrequency > 50.1 ? (
                <span className="text-amber-500 flex items-center font-medium">
                  <AlertTriangle className="h-4 w-4 mr-1" /> High
                </span>
              ) : (
                <span className="text-emerald-500 flex items-center">
                  Stable
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Carbon Intensity Card */}
        <Card className="border-l-4 border-l-slate-600 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <CardDescription>Carbon Intensity</CardDescription>
            <CardTitle className="text-2xl flex items-baseline gap-1">
              {currentData.carbonIntensity}
              <span className="text-sm font-normal text-slate-500">gCO2/kWh</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="w-full bg-slate-100 rounded-full h-2.5 mb-2 overflow-hidden">
              <div 
                className={cn("h-2.5 rounded-full transition-all duration-500", 
                  currentData.carbonIntensity > 700 ? "bg-slate-800" : "bg-emerald-500"
                )} 
                style={{ width: `${Math.min((currentData.carbonIntensity / 1000) * 100, 100)}%` }}
              ></div>
            </div>
            <p className="text-xs text-slate-500">
              {currentData.carbonIntensity > 700 ? 'High (Coal Dominant)' : 'Low (Renewables Active)'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Charts Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* EV Configuration Panel */}
        <Card className="mb-8">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Settings className="h-4 w-4" /> EV Charging Schedule & Priority
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-6 text-sm">
              <div className="flex flex-col gap-2">
                <span className="text-muted-foreground">Charging Priority</span>
                <div className="flex bg-slate-100 rounded-lg p-1">
                  <button
                    onClick={() => updateEvConfig({ chargePriority: 'cost' })}
                    className={cn("px-3 py-1 rounded-md transition-all", 
                      evConfig.chargePriority === 'cost' ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-900"
                    )}
                  >
                    💰 Cost Saver
                  </button>
                  <button
                    onClick={() => updateEvConfig({ chargePriority: 'speed' })}
                    className={cn("px-3 py-1 rounded-md transition-all", 
                      evConfig.chargePriority === 'speed' ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-900"
                    )}
                  >
                    ⚡ Fast Charge
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-muted-foreground">Plug-in Time</span>
                <select 
                  className="bg-slate-100 rounded-md px-3 py-1 border-none focus:ring-1 focus:ring-blue-500"
                  value={evConfig.plugInHour}
                  onChange={(e) => updateEvConfig({ plugInHour: parseInt(e.target.value) })}
                >
                  {Array.from({ length: 24 }).map((_, i) => (
                    <option key={i} value={i}>{i.toString().padStart(2, '0')}:00</option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-muted-foreground">Unplug Time</span>
                <select 
                  className="bg-slate-100 rounded-md px-3 py-1 border-none focus:ring-1 focus:ring-blue-500"
                  value={evConfig.unplugHour}
                  onChange={(e) => updateEvConfig({ unplugHour: parseInt(e.target.value) })}
                >
                  {Array.from({ length: 24 }).map((_, i) => (
                    <option key={i} value={i}>{i.toString().padStart(2, '0')}:00</option>
                  ))}
                </select>
              </div>
              
              <div className="flex flex-col gap-2">
                <span className="text-muted-foreground">EV Integration</span>
                <div className="flex items-center gap-2">
                   <button 
                    onClick={() => updateEvConfig({ enabled: !evConfig.enabled })}
                    className={cn("text-xs px-3 py-1.5 rounded border transition-colors", 
                      evConfig.enabled ? "bg-blue-50 border-blue-200 text-blue-700" : "bg-slate-50 border-slate-200 text-slate-500"
                    )}
                  >
                    {evConfig.enabled ? 'Enabled' : 'Disabled'}
                  </button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Price & Arbitrage Chart */}
        <Card className="lg:col-span-2 shadow-md">
          <CardHeader>
            <CardTitle>Arbitrage Opportunities (24h Forecast)</CardTitle>
            <CardDescription>
              Green zones indicate optimal charging times. Red zones indicate optimal selling times.
              <div className="flex items-center gap-4 mt-2 text-xs">
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded-sm bg-emerald-500/20 border border-emerald-500"></span> Charging
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded-sm bg-amber-500/20 border border-amber-500"></span> Discharging
                </span>
              </div>
            </CardDescription>
          </CardHeader>
          <CardContent className="h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis 
                  dataKey="time" 
                  tick={{fontSize: 12}} 
                  tickLine={false} 
                  axisLine={false}
                />
                <YAxis 
                  yAxisId="left" 
                  orientation="left" 
                  stroke="#64748b" 
                  tick={{fontSize: 12}} 
                  tickFormatter={(value) => `₹${value}`}
                  label={{ value: 'Price (INR)', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fill: '#64748b', fontSize: 12 } }}
                />
                <YAxis 
                  yAxisId="right" 
                  orientation="right" 
                  stroke="#10b981" 
                  tick={{fontSize: 12}} 
                  tickFormatter={(value) => `${value}%`}
                />
                <Tooltip 
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  labelStyle={{ fontWeight: 'bold', color: '#1e293b' }}
                />
                <Legend />
                
                {/* Action Indicators (Background Bars) */}
                <Bar 
                  dataKey={() => 100} 
                  yAxisId="right" 
                  name="System Action" 
                  barSize={100} // Wide enough to fill the gap
                  opacity={0.2}
                  legendType="none" // Hide from default legend as colors vary
                >
                  {data.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={
                        entry.action === 'Charging' ? '#10b981' : 
                        entry.action === 'Discharging' ? '#f59e0b' : 
                        'transparent'
                      } 
                    />
                  ))}
                </Bar>

                {/* Reference Lines for Thresholds */}
                <ReferenceLine yAxisId="left" y={SIMULATION_CONFIG.HIGH_PRICE_THRESHOLD} label={{ value: "Sell Threshold", fill: '#ef4444', fontSize: 10 }} stroke="#ef4444" strokeDasharray="3 3" />
                <ReferenceLine yAxisId="left" y={SIMULATION_CONFIG.LOW_PRICE_THRESHOLD} label={{ value: "Buy Threshold", fill: '#10b981', fontSize: 10 }} stroke="#10b981" strokeDasharray="3 3" />

                {/* Battery Level Area */}
                <Area 
                  yAxisId="right"
                  type="monotone" 
                  dataKey="batteryLevel" 
                  name="Home Battery %" 
                  fill="#10b981" 
                  fillOpacity={0.1} 
                  stroke="#10b981" 
                  strokeWidth={2}
                />

                {/* EV Battery Line */}
                <Line 
                  yAxisId="right"
                  type="monotone" 
                  dataKey="evBatteryLevel" 
                  name="EV Battery %" 
                  stroke="#3b82f6" 
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={false}
                />

                {/* Price Line */}
                <Line 
                  yAxisId="left"
                  type="stepAfter" 
                  dataKey="price" 
                  name="Grid Price (₹)" 
                  stroke="#3b82f6" 
                  strokeWidth={3}
                  dot={false}
                  activeDot={{ r: 6 }}
                />

                {/* Current Time Indicator */}
                <ReferenceLine x={currentData.time} stroke="#f59e0b" label={{ value: "NOW", fill: '#f59e0b', fontSize: 12, fontWeight: 'bold' }} />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* System Status / Logs */}
        <div className="space-y-4">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                System Configuration
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                <span className="text-sm text-slate-500">Mode</span>
                <span className="text-sm font-medium bg-blue-100 text-blue-700 px-2 py-1 rounded">Auto-Arbitrage</span>
              </div>
              <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                <span className="text-sm text-slate-500">Battery Capacity</span>
                <span className="text-sm font-medium">{SIMULATION_CONFIG.BATTERY_CAPACITY_KWH} kWh</span>
              </div>
              <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                <span className="text-sm text-slate-500">Max Charge Rate</span>
                <span className="text-sm font-medium">{SIMULATION_CONFIG.MAX_CHARGE_RATE_KW} kW</span>
              </div>
              <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                <span className="text-sm text-slate-500">Region</span>
                <span className="text-sm font-medium">{selectedState.name} ({selectedState.tariff})</span>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900 text-slate-300 shadow-md border-slate-800">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-yellow-500" />
                Controller Logs
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="font-mono text-xs space-y-2 h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                <div className="flex gap-2 border-l-2 border-slate-700 pl-2">
                  <span className="text-slate-500">[{currentData.time}]</span>
                  <span className={cn(
                    "font-bold",
                    currentData.action === 'Charging' ? "text-green-400" :
                    currentData.action === 'Discharging' ? "text-amber-400" : "text-slate-400"
                  )}>
                    ACTION: {currentData.action.toUpperCase()}
                  </span>
                </div>
                <div className="flex gap-2 pl-2">
                  <span className="text-slate-500">[{currentData.time}]</span>
                  <span>Grid Price: ₹{currentData.price.toFixed(2)}</span>
                </div>
                <div className="flex gap-2 pl-2">
                  <span className="text-slate-500">[{currentData.time}]</span>
                  <span>Battery: {currentData.batteryLevel}%</span>
                </div>
                {currentData.solarGeneration > 1 && (
                   <div className="flex gap-2 pl-2">
                   <span className="text-slate-500">[{currentData.time}]</span>
                   <span className="text-yellow-400">Solar Active: {currentData.solarGeneration.toFixed(1)}kW</span>
                 </div>
                )}
                 <div className="flex gap-2 opacity-50 pl-2 mt-4">
                  <span className="text-slate-500">[--:--]</span>
                  <span>Waiting for next interval...</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
