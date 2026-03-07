import { useState, useEffect } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, 
  AreaChart, Area, ComposedChart 
} from 'recharts';
import { Calendar, Search, ArrowLeft } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GridDataPoint, SIMULATION_CONFIG } from '@/lib/simulation';
import { cn } from '@/lib/utils';

interface HistoryViewProps {
  onBack: () => void;
}

export default function HistoryView({ onBack }: HistoryViewProps) {
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [historyData, setHistoryData] = useState<GridDataPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchHistory = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/history?date=${selectedDate}`);
        if (!response.ok) throw new Error('Failed to fetch history');
        const data = await response.json();
        setHistoryData(data);
      } catch (err) {
        console.error(err);
        setError("No data available for this date or server error.");
        setHistoryData([]);
      } finally {
        setLoading(false);
      }
    };

    if (selectedDate) {
      fetchHistory();
    }
  }, [selectedDate]);

  // Calculate daily stats
  const dailyStats = historyData.reduce((acc, curr) => {
    if (curr.action === 'Charging') {
      acc.charged += SIMULATION_CONFIG.MAX_CHARGE_RATE_KW; // Approximation
      acc.cost += SIMULATION_CONFIG.MAX_CHARGE_RATE_KW * curr.price;
    } else if (curr.action === 'Discharging') {
      acc.discharged += SIMULATION_CONFIG.MAX_DISCHARGE_RATE_KW;
      acc.revenue += SIMULATION_CONFIG.MAX_DISCHARGE_RATE_KW * curr.price;
    }
    return acc;
  }, { charged: 0, discharged: 0, cost: 0, revenue: 0 });

  const profit = dailyStats.revenue - dailyStats.cost;

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans">
      <header className="mb-8 flex items-center gap-4">
        <button 
          onClick={onBack}
          className="p-2 hover:bg-slate-200 rounded-full transition-colors"
        >
          <ArrowLeft className="h-6 w-6 text-slate-600" />
        </button>
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Historical Analysis</h1>
          <p className="text-slate-500">Review past grid performance and arbitrage results</p>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Controls & Stats */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Calendar className="h-5 w-5 text-slate-500" />
                Select Date
              </CardTitle>
            </CardHeader>
            <CardContent>
              <input 
                type="date" 
                className="w-full p-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
              />
            </CardContent>
          </Card>

          {historyData.length > 0 && (
            <Card className="bg-white">
              <CardHeader>
                <CardTitle>Daily Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between border-b pb-2">
                  <span className="text-slate-500">Total Profit</span>
                  <span className={cn("font-bold", profit >= 0 ? "text-green-600" : "text-red-600")}>
                    ₹{profit.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <span className="text-slate-500">Energy Charged</span>
                  <span className="font-mono">{dailyStats.charged.toFixed(1)} kWh</span>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <span className="text-slate-500">Energy Discharged</span>
                  <span className="font-mono">{dailyStats.discharged.toFixed(1)} kWh</span>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Charts */}
        <div className="lg:col-span-3 space-y-6">
          {loading ? (
            <div className="h-[400px] flex items-center justify-center text-slate-400">
              Loading data...
            </div>
          ) : error ? (
            <div className="h-[400px] flex items-center justify-center text-red-400 bg-red-50 rounded-lg border border-red-100">
              {error}
            </div>
          ) : historyData.length === 0 ? (
            <div className="h-[400px] flex items-center justify-center text-slate-400 bg-slate-100 rounded-lg border border-slate-200 border-dashed">
              Select a date to view history
            </div>
          ) : (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Price vs Battery Level</CardTitle>
                </CardHeader>
                <CardContent className="h-[350px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={historyData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="time" />
                      <YAxis yAxisId="left" label={{ value: 'Price (₹)', angle: -90, position: 'insideLeft' }} />
                      <YAxis yAxisId="right" orientation="right" label={{ value: 'Battery (%)', angle: 90, position: 'insideRight' }} />
                      <Tooltip />
                      <Legend />
                      <Area yAxisId="right" type="monotone" dataKey="batteryLevel" fill="#10b981" fillOpacity={0.2} stroke="#10b981" name="Battery %" />
                      <Line yAxisId="left" type="stepAfter" dataKey="price" stroke="#3b82f6" strokeWidth={2} name="Price ₹" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Grid Frequency & Carbon Intensity</CardTitle>
                </CardHeader>
                <CardContent className="h-[350px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={historyData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="time" />
                      <YAxis yAxisId="left" domain={[49.5, 50.5]} label={{ value: 'Freq (Hz)', angle: -90, position: 'insideLeft' }} />
                      <YAxis yAxisId="right" orientation="right" label={{ value: 'Carbon (gCO2)', angle: 90, position: 'insideRight' }} />
                      <Tooltip />
                      <Legend />
                      <Line yAxisId="left" type="monotone" dataKey="gridFrequency" stroke="#8b5cf6" name="Frequency (Hz)" dot={false} />
                      <Area yAxisId="right" type="monotone" dataKey="carbonIntensity" fill="#64748b" fillOpacity={0.2} stroke="#64748b" name="Carbon Intensity" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
