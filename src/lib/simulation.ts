export interface GridDataPoint {
  time: string;
  hour: number;
  price: number; // in INR (₹)
  demand: number; // in kW
  solarGeneration: number; // in kW
  batteryLevel: number; // in %
  action: 'Charging' | 'Discharging' | 'Idle';
  gridFrequency: number; // Hz
  carbonIntensity: number; // gCO2/kWh
  evBatteryLevel: number; // in %
  evLoad: number; // in kW (charging rate)
  evStatus: 'Connected' | 'Disconnected' | 'Charging';
}

export interface EVConfig {
  enabled: boolean;
  capacityKwh: number;
  maxChargeRateKw: number;
  plugInHour: number; // 0-23
  unplugHour: number; // 0-23
  chargePriority: 'cost' | 'speed'; // 'cost' = wait for low price, 'speed' = charge immediately
}

export const DEFAULT_EV_CONFIG: EVConfig = {
  enabled: true,
  capacityKwh: 40, // Standard EV (e.g. Tata Nexon EV)
  maxChargeRateKw: 7.2, // Level 2 charger
  plugInHour: 18, // 6 PM
  unplugHour: 8, // 8 AM
  chargePriority: 'cost'
};

export const SIMULATION_CONFIG = {
  BATTERY_CAPACITY_KWH: 13.5, // Tesla Powerwall 2 equivalent
  MAX_CHARGE_RATE_KW: 5,
  MAX_DISCHARGE_RATE_KW: 5,
  LOW_PRICE_THRESHOLD: 5.0, // Buy below this
  HIGH_PRICE_THRESHOLD: 9.0, // Sell above this
};

// Generate a 24-hour profile based on typical Indian grid patterns
export function generateDailyProfile(evConfig: EVConfig = DEFAULT_EV_CONFIG): GridDataPoint[] {
  const data: GridDataPoint[] = [];
  let currentBatteryKwh = 2; // Start low
  
  // EV State
  let currentEvKwh = evConfig.capacityKwh * 0.4; // Start at 40%

  for (let hour = 0; hour < 24; hour++) {
    // 1. Price Model (ToU Tariff Simulation)
    let price = 4.5; // Base off-peak
    if (hour >= 6 && hour < 10) price = 8.0; // Morning Peak
    else if (hour >= 10 && hour < 17) price = 5.5; // Solar Hours
    else if (hour >= 17 && hour < 22) price = 11.5; // Evening Peak
    else if (hour >= 22) price = 5.0; // Late evening

    // Add some noise
    price += (Math.random() - 0.5) * 0.5;

    // 2. Solar Generation Model (Bell curve centered at 13:00)
    let solar = 0;
    if (hour >= 6 && hour <= 18) {
      solar = 4 * Math.sin(((hour - 6) / 12) * Math.PI);
      solar += (Math.random() - 0.5) * 0.5; // Cloud cover noise
      if (solar < 0) solar = 0;
    }

    // 3. Demand Model (Morning and Evening peaks)
    let demand = 1.0; // Base load
    if (hour >= 7 && hour < 10) demand += 2.0; // Morning routine
    if (hour >= 18 && hour < 22) demand += 3.0; // Evening routine
    demand += (Math.random() - 0.5) * 0.2;

    // 4. Grid Frequency (50Hz nominal, drops under load)
    let frequency = 50.0;
    if (hour >= 18 && hour < 22) frequency -= 0.15; // High load
    else if (hour >= 10 && hour < 16) frequency += 0.05; // High solar injection
    frequency += (Math.random() - 0.5) * 0.05;

    // 5. Carbon Intensity (High at night/evening - Coal, Low at day - Solar)
    let carbon = 850; // Base coal heavy
    if (hour >= 8 && hour <= 17) carbon -= 300; // Solar impact
    if (hour >= 18 && hour <= 22) carbon += 100; // Peaker plants
    carbon += (Math.random() - 0.5) * 20;

    // 6. EV Logic
    let evLoad = 0;
    let evStatus: 'Connected' | 'Disconnected' | 'Charging' = 'Disconnected';
    
    // Check if plugged in
    // Handle wrap-around time (e.g. 18:00 to 08:00)
    const isPluggedIn = evConfig.plugInHour > evConfig.unplugHour 
      ? (hour >= evConfig.plugInHour || hour < evConfig.unplugHour)
      : (hour >= evConfig.plugInHour && hour < evConfig.unplugHour);

    if (evConfig.enabled && isPluggedIn) {
      evStatus = 'Connected';
      
      // Charging Logic
      let shouldCharge = false;
      
      if (evConfig.chargePriority === 'speed') {
        shouldCharge = true;
      } else {
        // Cost priority: Charge if price is low OR if we are running out of time to reach 100%
        // Simple logic: Charge if price < threshold
        if (price <= SIMULATION_CONFIG.LOW_PRICE_THRESHOLD) {
          shouldCharge = true;
        }
        
        // "Panic" charging: if we are close to unplug time and not full, charge anyway
        // (Simplified for simulation: just charge if < 80% and within 2 hours of unplug)
        let hoursLeft = 0;
        if (hour < evConfig.unplugHour) hoursLeft = evConfig.unplugHour - hour;
        else hoursLeft = (24 - hour) + evConfig.unplugHour;
        
        if (hoursLeft <= 2 && (currentEvKwh / evConfig.capacityKwh) < 0.8) {
           shouldCharge = true;
        }
      }

      if (shouldCharge && currentEvKwh < evConfig.capacityKwh) {
        evLoad = Math.min(evConfig.maxChargeRateKw, evConfig.capacityKwh - currentEvKwh);
        currentEvKwh += evLoad;
        evStatus = 'Charging';
      }
    } else {
      // If not plugged in, assume some usage (driving)
      if (hour === 8 || hour === 17) { // Commute times
         currentEvKwh -= 5; // Use 5kWh
         if (currentEvKwh < 0) currentEvKwh = 0;
      }
    }

    // 7. Battery Logic (Arbitrage)
    let action: 'Charging' | 'Discharging' | 'Idle' = 'Idle';
    let powerFlow = 0; // + is charging, - is discharging

    const netLoad = demand + evLoad - solar; // Include EV load in net load

    if (price <= SIMULATION_CONFIG.LOW_PRICE_THRESHOLD) {
      // Cheap electricity: Charge as much as possible
      action = 'Charging';
      powerFlow = SIMULATION_CONFIG.MAX_CHARGE_RATE_KW;
    } else if (price >= SIMULATION_CONFIG.HIGH_PRICE_THRESHOLD) {
      // Expensive electricity: Discharge
      action = 'Discharging';
      powerFlow = -SIMULATION_CONFIG.MAX_DISCHARGE_RATE_KW;
    } else {
      // Mid-price: Self-consumption logic
      if (netLoad < 0) {
        // Excess solar
        action = 'Charging';
        powerFlow = Math.min(Math.abs(netLoad), SIMULATION_CONFIG.MAX_CHARGE_RATE_KW);
      } else {
        // Deficit
        if (currentBatteryKwh > 0) {
           action = 'Discharging';
           powerFlow = -Math.min(netLoad, SIMULATION_CONFIG.MAX_DISCHARGE_RATE_KW);
        } else {
           action = 'Idle';
           powerFlow = 0;
        }
      }
    }

    // Update Battery State
    if (powerFlow > 0) { // Charging
        const space = SIMULATION_CONFIG.BATTERY_CAPACITY_KWH - currentBatteryKwh;
        const actualCharge = Math.min(powerFlow, space);
        currentBatteryKwh += actualCharge;
        if (actualCharge < powerFlow) action = 'Idle'; // Full
    } else if (powerFlow < 0) { // Discharging
        const available = currentBatteryKwh;
        const actualDischarge = Math.min(Math.abs(powerFlow), available);
        currentBatteryKwh -= actualDischarge;
        if (actualDischarge < Math.abs(powerFlow)) action = 'Idle'; // Empty
    }

    data.push({
      time: `${hour.toString().padStart(2, '0')}:00`,
      hour,
      price: parseFloat(price.toFixed(2)),
      demand: parseFloat(demand.toFixed(2)),
      solarGeneration: parseFloat(solar.toFixed(2)),
      batteryLevel: Math.round((currentBatteryKwh / SIMULATION_CONFIG.BATTERY_CAPACITY_KWH) * 100),
      action,
      gridFrequency: parseFloat(frequency.toFixed(3)),
      carbonIntensity: Math.round(carbon),
      evBatteryLevel: Math.round((currentEvKwh / evConfig.capacityKwh) * 100),
      evLoad: parseFloat(evLoad.toFixed(2)),
      evStatus
    });
  }

  return data;
}
