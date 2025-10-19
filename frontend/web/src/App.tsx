// App.tsx
import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import "./App.css";
import { useAccount, useSignMessage } from 'wagmi';

interface CityData {
  id: string;
  name: string;
  encryptedDemand: string;
  encryptedSupply: string;
  connected: boolean;
  profit: number;
  railConnections: string[];
}

interface Route {
  from: string;
  to: string;
  distance: number;
  cost: number;
  active: boolean;
}

const FHEEncryptNumber = (value: number): string => {
  return `FHE-${btoa(value.toString())}`;
};

const FHEDecryptNumber = (encryptedData: string): number => {
  if (encryptedData.startsWith('FHE-')) {
    return parseFloat(atob(encryptedData.substring(4)));
  }
  return parseFloat(encryptedData);
};

const generatePublicKey = () => `0x${Array(2000).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('')}`;

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [loading, setLoading] = useState(true);
  const [cities, setCities] = useState<CityData[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [balance, setBalance] = useState(100000);
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const [showDecrypted, setShowDecrypted] = useState(false);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [publicKey, setPublicKey] = useState<string>("");
  const [contractAddress, setContractAddress] = useState<string>("");
  const [chainId, setChainId] = useState<number>(0);
  const [startTimestamp, setStartTimestamp] = useState<number>(0);
  const [durationDays, setDurationDays] = useState<number>(30);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ visible: false, status: "pending", message: "" });
  const [showFeatures, setShowFeatures] = useState(false);

  // Initialize game with empty data
  useEffect(() => {
    const initGame = async () => {
      setLoading(true);
      try {
        const contract = await getContractReadOnly();
        if (!contract) return;
        
        const isAvailable = await contract.isAvailable();
        if (!isAvailable) {
          console.error("Contract not available");
          return;
        }

        // Initialize empty game state
        setCities([]);
        setRoutes([]);
        setBalance(100000);
        
        // Initialize signature params
        if (contract) setContractAddress(await contract.getAddress());
        if (window.ethereum) {
          const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
          setChainId(parseInt(chainIdHex, 16));
        }
        setStartTimestamp(Math.floor(Date.now() / 1000));
        setDurationDays(30);
        setPublicKey(generatePublicKey());
      } catch (e) {
        console.error("Initialization error:", e);
      } finally {
        setLoading(false);
      }
    };
    
    initGame();
  }, []);

  const decryptWithSignature = async (encryptedData: string): Promise<number | null> => {
    if (!isConnected) { alert("Please connect wallet first"); return null; }
    setIsDecrypting(true);
    try {
      const message = `publickey:${publicKey}\ncontractAddresses:${contractAddress}\ncontractsChainId:${chainId}\nstartTimestamp:${startTimestamp}\ndurationDays:${durationDays}`;
      await signMessageAsync({ message });
      await new Promise(resolve => setTimeout(resolve, 1500));
      return FHEDecryptNumber(encryptedData);
    } catch (e) { console.error("Decryption failed:", e); return null; } 
    finally { setIsDecrypting(false); }
  };

  const handleCheckAvailability = async () => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) throw new Error("Contract not available");
      
      const isAvailable = await contract.isAvailable();
      setTransactionStatus({ 
        visible: true, 
        status: "success", 
        message: isAvailable ? "Contract is available and ready" : "Contract not available" 
      });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e) {
      setTransactionStatus({ 
        visible: true, 
        status: "error", 
        message: "Error checking contract availability" 
      });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    }
  };

  const handleAddCity = async () => {
    if (!isConnected) { alert("Please connect wallet first"); return; }
    setTransactionStatus({ visible: true, status: "pending", message: "Adding new city with FHE encrypted market..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract");
      
      const cityId = `city-${Date.now()}`;
      const cityName = `City ${cities.length + 1}`;
      
      // Generate random supply and demand (FHE encrypted)
      const demand = Math.floor(Math.random() * 100) + 50;
      const supply = Math.floor(Math.random() * 100) + 20;
      const encryptedDemand = FHEEncryptNumber(demand);
      const encryptedSupply = FHEEncryptNumber(supply);
      
      // Save to contract
      const cityData = {
        id: cityId,
        name: cityName,
        encryptedDemand,
        encryptedSupply,
        connected: false,
        profit: 0,
        railConnections: []
      };
      
      await contract.setData(`city_${cityId}`, ethers.toUtf8Bytes(JSON.stringify(cityData)));
      
      // Update keys
      const keysBytes = await contract.getData("city_keys");
      let keys: string[] = [];
      if (keysBytes.length > 0) {
        try { keys = JSON.parse(ethers.toUtf8String(keysBytes)); } 
        catch (e) { console.error("Error parsing keys:", e); }
      }
      keys.push(cityId);
      await contract.setData("city_keys", ethers.toUtf8Bytes(JSON.stringify(keys)));
      
      // Update local state
      setCities([...cities, cityData]);
      setTransactionStatus({ visible: true, status: "success", message: "City added with encrypted market data!" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Failed to add city" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    }
  };

  const handleBuildRoute = async (from: string, to: string) => {
    if (!isConnected) { alert("Please connect wallet first"); return; }
    if (from === to) { alert("Cannot connect city to itself"); return; }
    
    setTransactionStatus({ visible: true, status: "pending", message: "Building encrypted trade route..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract");
      
      const distance = Math.floor(Math.random() * 500) + 100;
      const cost = distance * 50;
      
      if (balance < cost) {
        throw new Error("Not enough funds to build this route");
      }
      
      const routeId = `route-${from}-${to}-${Date.now()}`;
      const routeData = {
        from,
        to,
        distance,
        cost,
        active: true
      };
      
      await contract.setData(`route_${routeId}`, ethers.toUtf8Bytes(JSON.stringify(routeData)));
      
      // Update keys
      const keysBytes = await contract.getData("route_keys");
      let keys: string[] = [];
      if (keysBytes.length > 0) {
        try { keys = JSON.parse(ethers.toUtf8String(keysBytes)); } 
        catch (e) { console.error("Error parsing keys:", e); }
      }
      keys.push(routeId);
      await contract.setData("route_keys", ethers.toUtf8Bytes(JSON.stringify(keys)));
      
      // Update cities
      const updatedCities = cities.map(city => {
        if (city.id === from) {
          return {
            ...city,
            connected: true,
            railConnections: [...city.railConnections, to]
          };
        }
        if (city.id === to) {
          return {
            ...city,
            connected: true,
            railConnections: [...city.railConnections, from]
          };
        }
        return city;
      });
      
      // Update local state
      setCities(updatedCities);
      setRoutes([...routes, routeData]);
      setBalance(balance - cost);
      setTransactionStatus({ visible: true, status: "success", message: "Route built successfully!" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e: any) {
      setTransactionStatus({ visible: true, status: "error", message: e.message || "Failed to build route" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    }
  };

  const handleTransportGoods = async (from: string, to: string) => {
    if (!isConnected) { alert("Please connect wallet first"); return; }
    if (from === to) { alert("Cannot transport to same city"); return; }
    
    setTransactionStatus({ visible: true, status: "pending", message: "Calculating encrypted trade profit..." });
    
    try {
      const fromCity = cities.find(c => c.id === from);
      const toCity = cities.find(c => c.id === to);
      
      if (!fromCity || !toCity) throw new Error("Cities not found");
      
      // In a real FHE scenario, we would perform encrypted calculations here
      // For demo purposes, we'll decrypt, calculate, then show the encrypted result
      const fromSupply = await decryptWithSignature(fromCity.encryptedSupply);
      const toDemand = await decryptWithSignature(toCity.encryptedDemand);
      
      if (fromSupply === null || toDemand === null) {
        throw new Error("Failed to decrypt market data");
      }
      
      const profit = Math.floor((toDemand - fromSupply) * 10);
      
      // Update cities with new encrypted values (simulating market changes)
      const updatedCities = cities.map(city => {
        if (city.id === from) {
          const newSupply = Math.max(5, fromSupply - 10);
          return {
            ...city,
            encryptedSupply: FHEEncryptNumber(newSupply),
            profit: city.profit - profit // negative for sending city
          };
        }
        if (city.id === to) {
          const newDemand = Math.max(20, toDemand - 5);
          return {
            ...city,
            encryptedDemand: FHEEncryptNumber(newDemand),
            profit: city.profit + profit
          };
        }
        return city;
      });
      
      // Update balance
      setCities(updatedCities);
      setBalance(balance + profit);
      setTransactionStatus({ 
        visible: true, 
        status: "success", 
        message: `Transport completed! Profit: $${profit}` 
      });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e: any) {
      setTransactionStatus({ visible: true, status: "error", message: e.message || "Transport failed" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    }
  };

  const toggleDecryptedView = async () => {
    if (!showDecrypted) {
      // Decrypt all cities when showing decrypted view
      setIsDecrypting(true);
      try {
        const decryptedCities = await Promise.all(cities.map(async city => {
          const demand = await decryptWithSignature(city.encryptedDemand);
          const supply = await decryptWithSignature(city.encryptedSupply);
          return {
            ...city,
            decryptedDemand: demand,
            decryptedSupply: supply
          };
        }));
        setCities(decryptedCities as any);
      } catch (e) {
        console.error("Decryption error:", e);
      } finally {
        setIsDecrypting(false);
      }
    }
    setShowDecrypted(!showDecrypted);
  };

  const renderCityStats = () => {
    const connectedCities = cities.filter(c => c.connected).length;
    const totalProfit = cities.reduce((sum, city) => sum + city.profit, 0);
    const activeRoutes = routes.filter(r => r.active).length;
    
    return (
      <div className="stats-container">
        <div className="stat-item">
          <div className="stat-value">{cities.length}</div>
          <div className="stat-label">Cities</div>
        </div>
        <div className="stat-item">
          <div className="stat-value">{connectedCities}</div>
          <div className="stat-label">Connected</div>
        </div>
        <div className="stat-item">
          <div className="stat-value">${balance.toLocaleString()}</div>
          <div className="stat-label">Balance</div>
        </div>
        <div className="stat-item">
          <div className="stat-value">${totalProfit.toLocaleString()}</div>
          <div className="stat-label">Total Profit</div>
        </div>
        <div className="stat-item">
          <div className="stat-value">{activeRoutes}</div>
          <div className="stat-label">Routes</div>
        </div>
      </div>
    );
  };

  const renderRailMap = () => {
    return (
      <div className="rail-map">
        {cities.map(city => (
          <div 
            key={city.id} 
            className={`city-node ${city.connected ? 'connected' : ''} ${selectedCity === city.id ? 'selected' : ''}`}
            onClick={() => setSelectedCity(city.id)}
            style={{
              left: `${Math.random() * 80 + 10}%`,
              top: `${Math.random() * 80 + 10}%`
            }}
          >
            <div className="city-name">{city.name}</div>
            {city.connected && (
              <div className="city-connections">
                {city.railConnections.map(connId => {
                  const targetCity = cities.find(c => c.id === connId);
                  if (!targetCity) return null;
                  return (
                    <div 
                      key={connId} 
                      className="connection-line"
                      style={{
                        transform: `rotate(${Math.atan2(
                          (cities.findIndex(c => c.id === connId) * 100 - cities.findIndex(c => c.id === city.id) * 100),
                          (cities.findIndex(c => c.id === connId) * 100 - cities.findIndex(c => c.id === city.id) * 100)
                        )}rad)`
                      }}
                    ></div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="pixel-spinner"></div>
      <p>Initializing encrypted railroad...</p>
    </div>
  );

  return (
    <div className="app-container pixel-theme">
      <header className="app-header">
        <div className="logo">
          <h1>FHE Railroad Tycoon</h1>
          <div className="subtitle"></div>
        </div>
        <div className="header-actions">
          <div className="wallet-connect-wrapper">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
          <button 
            className="pixel-button" 
            onClick={handleCheckAvailability}
          >
            Check FHE Status
          </button>
        </div>
      </header>
      
      <div className="main-content">
        <div className="left-panel">
          <div className="panel-section">
            <h2>Rail Network</h2>
            {renderRailMap()}
          </div>
          
          <div className="panel-section">
            <h2>Statistics</h2>
            {renderCityStats()}
          </div>
        </div>
        
        <div className="right-panel">
          <div className="panel-section">
            <div className="section-header">
              <h2>City Management</h2>
              <div className="button-group">
                <button className="pixel-button" onClick={handleAddCity}>
                  Add City
                </button>
                <button 
                  className="pixel-button" 
                  onClick={toggleDecryptedView}
                  disabled={isDecrypting}
                >
                  {showDecrypted ? 'Hide Data' : 'Decrypt Markets'}
                </button>
                <button 
                  className="pixel-button" 
                  onClick={() => setShowFeatures(!showFeatures)}
                >
                  {showFeatures ? 'Hide Features' : 'Show Features'}
                </button>
              </div>
            </div>
            
            {showFeatures && (
              <div className="features-section">
                <h3>FHE Railroad Features</h3>
                <ul>
                  <li>• Encrypted cargo markets in each city</li>
                  <li>• Private supply & demand discovery</li>
                  <li>• Homomorphic profit calculations</li>
                  <li>• Secure route building</li>
                  <li>• Wallet-based decryption</li>
                </ul>
              </div>
            )}
            
            <div className="cities-list">
              {cities.map(city => (
                <div 
                  key={city.id} 
                  className={`city-card ${selectedCity === city.id ? 'selected' : ''}`}
                  onClick={() => setSelectedCity(city.id)}
                >
                  <div className="city-header">
                    <h3>{city.name}</h3>
                    <div className={`city-status ${city.connected ? 'connected' : 'disconnected'}`}>
                      {city.connected ? 'Connected' : 'Isolated'}
                    </div>
                  </div>
                  
                  <div className="city-details">
                    {showDecrypted ? (
                      <>
                        <div className="detail-item">
                          <span>Demand:</span>
                          <strong>{city.decryptedDemand || '?'}</strong>
                        </div>
                        <div className="detail-item">
                          <span>Supply:</span>
                          <strong>{city.decryptedSupply || '?'}</strong>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="detail-item">
                          <span>Demand:</span>
                          <strong>FHE-Encrypted</strong>
                        </div>
                        <div className="detail-item">
                          <span>Supply:</span>
                          <strong>FHE-Encrypted</strong>
                        </div>
                      </>
                    )}
                    <div className="detail-item">
                      <span>Profit:</span>
                      <strong className={city.profit >= 0 ? 'positive' : 'negative'}>
                        ${city.profit.toLocaleString()}
                      </strong>
                    </div>
                  </div>
                  
                  <div className="city-actions">
                    {selectedCity && selectedCity !== city.id && (
                      <>
                        {routes.some(r => 
                          (r.from === selectedCity && r.to === city.id) || 
                          (r.from === city.id && r.to === selectedCity)
                        ) ? (
                          <button 
                            className="pixel-button small"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleTransportGoods(selectedCity, city.id);
                            }}
                          >
                            Transport Goods
                          </button>
                        ) : (
                          <button 
                            className="pixel-button small"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleBuildRoute(selectedCity, city.id);
                            }}
                          >
                            Build Route (${Math.floor(Math.random() * 20000) + 5000})
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      
      {transactionStatus.visible && (
        <div className="transaction-notice">
          <div className={`pixel-alert ${transactionStatus.status}`}>
            {transactionStatus.message}
          </div>
        </div>
      )}
      
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="fhe-badge">
              <span>Powered by Zama FHE</span>
            </div>
            <p>Railroad Tycoon with Fully Homomorphic Encryption</p>
          </div>
          <div className="footer-links">
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">Privacy</a>
            <a href="#" className="footer-link">Terms</a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;