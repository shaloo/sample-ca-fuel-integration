import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'
import { useEffect, useState } from "react";
import {
  useBalance,
  useConnect,
  useConnectUI,
  useIsConnected,
  useWallet,
  useAccounts,
  useSendTransaction,
  useDisconnect,
  useConnectors,
} from "@fuels/react";
import { Address, bn, Account } from 'fuels';
import { CA } from '@arcana/ca-sdk';
import { CounterContract } from "./sway-api";

const CONTRACT_ID = "0xc16c75d511431ee5568c36e0bad44b1763ba1fdecec056450062d35fe16ff3b0";
const COPY_TIMEOUT = 2000;

// Type definitions
interface TokenBalance {
  balanceInFiat: number;
  tokenName?: string;
  balance?: string;
}

interface UnifiedBalancesResponse {
  totalBalances?: TokenBalance[];
  ethBalance?: TokenBalance;
  usdcBalance?: TokenBalance;
  usdtBalance?: TokenBalance;
  pol?: TokenBalance;
}

const isValidAddress = (address: string | null): address is string => {
  if (!address) return false;
  try {
    Address.fromString(address);
    return true;
  } catch {
    return false;
  }
};

function App() {
  const [count, setCount] = useState(0);
  const [contract, setContract] = useState<CounterContract>();
  const [counter, setCounter] = useState<number>();
  const [unifiedBalance, setUnifiedBalance] = useState<{
    totalFiat: number;
    individualBalances: TokenBalance[];
  } | null>(null);
  const [chainBalances, setChainBalances] = useState<{
    totalFiat: number;
    tokens: TokenBalance[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [myBalance, setMyBalance] = useState<number | undefined>(undefined);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCAModalOpen, setIsCAModalOpen] = useState(false);
  const [showBalancePopup, setShowBalancePopup] = useState(false);
  const [transferData, setTransferData] = useState({ toAddress: "", amount: "" });
  const [isTransferring, setIsTransferring] = useState(false);
  const [isCAinitialized, setIsCAinitialized] = useState(false);
  const [isCAFuelEnabled, setIsCAFuelEnabled] = useState(false);
  const [isCATransferring, setIsCATransferring] = useState(false);

  const { connect } = useConnect();
  const { isConnected } = useIsConnected();
  const { isConnecting } = useConnectUI();
  const { disconnect } = useDisconnect();
  const { wallet } = useWallet();
  const { connectors } = useConnectors();
  const { accounts } = useAccounts();
  const { sendTransaction } = useSendTransaction();
  const { balance } = useBalance({
    address: wallet?.address?.toAddress() ?? "",
    assetId: wallet?.provider?.getBaseAssetId() ?? "",
  });

  const EVMprovider = window.ethereum;
  const ca = new CA();

  const initCA = async () => {
    try {
      ca.setEVMProvider(EVMprovider);
      await ca.init();
      setToastMessage("CA initialized with EVMProvider");
      setIsCAinitialized(true);
    } catch (e) {
      console.error("CA initialization failed:", e);
      setToastMessage("Failed to initialize CA");
    }
  };

  const enableCAinFuel = async () => {
    if (isCAinitialized && !isCAFuelEnabled && connectors.length > 0) {
      try {
        const fuelConn = connectors[0];
        setToastMessage("Setting Fuel Connector...");
        console.log("Fuel Connector to be set to: ", connectors[0]);
        const response = await ca.setFuelConnector(fuelConn);
        console.log("Fuel Connector set successfully", response);
        setToastMessage("Fuel Connector set successfully");
        setIsCAFuelEnabled(true);
      } catch (e) {
        console.error("Failed to set Fuel Connector:", e);
        setToastMessage("Failed to set Fuel Connector");
      }
    } else {
      setToastMessage("No Fuel connectors available");
    }
  };

  useEffect(() => {
    if (isCAinitialized && !isCAFuelEnabled && connectors.length > 0) {
      enableCAinFuel();
    }
  }, [isCAinitialized, connectors, isCAFuelEnabled]);

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedIndex(index);
      setToastMessage(`Copied account ${index + 1} to clipboard!`);
      setTimeout(() => {
        setCopiedIndex(null);
        setToastMessage(null);
      }, COPY_TIMEOUT);
    });
  };

  const renderAccounts = (accounts: string[] | undefined, copiedIndex: number | null, copyFn: (text: string, index: number) => void) => {
    if (!accounts) return <p>Loading accounts...</p>;
    return accounts.length > 0 ? (
      accounts.map((account, index) => {
        const displayText = account.length > 8 ? `${account.slice(0, 5)}...${account.slice(-3)}` : account;
        return (
          <p key={index}>
            Account {index + 1}: {displayText}
            <span
              onClick={() => copyFn(account, index)}
              style={{ cursor: "pointer", marginLeft: "5px" }}
              role="button"
              aria-label={`Copy account ${index + 1} address`}
            >
              {copiedIndex === index ? "✅" : "📋"}
            </span>
          </p>
        );
      })
    ) : (
      <p>No accounts available</p>
    );
  };

  const getCount = async (counterContract: CounterContract) => {
    try {
      const { value } = await counterContract.functions.count().get();
      setToastMessage(`Counter value: ${value.toNumber()}`);
      setCounter(value.toNumber());
    } catch (error) {
      console.error("Failed to get count:", error);
      setToastMessage("Failed to fetch counter value");
    }
  };

  useEffect(() => {
    let isMounted = true;
    async function initializeData() {
      if (isConnected && wallet && wallet.provider && isMounted) {
        try {
          const counterContract = new CounterContract(CONTRACT_ID, wallet);
          await getCount(counterContract);
          if (isMounted) {
            setContract(counterContract);
            await refreshMyBalance();
          }
        } catch (error) {
          if (isMounted) {
            console.error("Error initializing data:", error);
            setMyBalance(undefined);
            setContract(undefined);
            setCounter(undefined);
            setIsCAinitialized(false);
            setToastMessage("Failed to initialize data");
          }
        }
      }
    }
    initializeData();
    return () => {
      isMounted = false;
    };
  }, [isConnected, wallet]);

  useEffect(() => {
    async function fetchUnifiedBalance() {
      if (isCAinitialized && isConnected && wallet && isValidAddress(wallet.address.toAddress())) {
        try {
          const balances: UnifiedBalancesResponse = await ca.getUnifiedBalances();
          let totalFiat = 0;
          let individualBalances: TokenBalance[] = [];
          if (Array.isArray(balances.totalBalances)) {
            totalFiat = balances.totalBalances.reduce((sum: number, token: TokenBalance) => {
              return sum + (typeof token.balanceInFiat === 'number' ? token.balanceInFiat : 0);
            }, 0);
            individualBalances = balances.totalBalances;
          } else {
            const keys = ['ethBalance', 'usdcBalance', 'usdtBalance', 'pol'];
            individualBalances = keys.map((key) => balances[key] as TokenBalance).filter(Boolean);
            totalFiat = individualBalances.reduce((sum: number, token: TokenBalance) => {
              return sum + (typeof token.balanceInFiat === 'number' ? token.balanceInFiat : 0);
            }, 0);
          }
          setUnifiedBalance({
            totalFiat,
            individualBalances,
          });
          setError(null);
        } catch (err) {
          setUnifiedBalance(null);
          setError("Failed to fetch unified balance");
          setToastMessage("Failed to fetch unified balance");
          console.error("getUnifiedBalances error:", err);
        }
      } else {
        setToastMessage("Wallet not connected or invalid address");
      }
    }
    fetchUnifiedBalance();
  }, [isCAinitialized, isConnected, wallet]);

  const formatBalance = (balanceWei?: number) => {
    if (balanceWei === undefined) return "Loading...";
    const ethValue = balanceWei / 1e9;
    return `${ethValue.toFixed(6)} ETH`;
  };

  const refreshMyBalance = async () => {
    if (wallet && wallet.provider) {
      try {
        const assetId = await wallet.provider.getBaseAssetId();
        const balanceBN = await wallet.getBalance(assetId);
        setMyBalance(balanceBN.toNumber());
      } catch (error) {
        console.error("Failed to refresh balance:", error);
        setMyBalance(undefined);
        setToastMessage("Failed to refresh balance");
      }
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setTransferData((prev) => ({ ...prev, [name]: value }));
  };

  const handleFuelTransfer = async () => {
    if (!wallet) {
      setToastMessage("Wallet not connected");
      return;
    }
    setIsTransferring(true);
    try {
      const { toAddress, amount } = transferData;
      if (!toAddress || !amount) {
        setToastMessage("Please fill all fields");
        return;
      }
      const amountInNanoETH = bn(parseFloat(amount) * 1e9);
      const assetId = await wallet.provider.getBaseAssetId();
      const transactionRequest = await wallet.createTransfer(toAddress, amountInNanoETH, assetId);
      const response = await wallet.sendTransaction(transactionRequest);
      if (!response || !response.id) {
        throw new Error("Transaction response missing or invalid");
      }
      setToastMessage(`Successfully sent ${amount} ETH. Tx ID: ${response.id}`);
      setIsModalOpen(false);
      setTransferData({ toAddress: "", amount: "" });
      await refreshMyBalance();
    } catch (err) {
      console.error("Transfer failed:", err);
      setToastMessage("Transfer failed: " + (err.message || "Unknown error"));
    } finally {
      setIsTransferring(false);
    }
  };

  const handleCATransfer = async () => {
    if (!wallet || !isCAinitialized) {
      setToastMessage("Wallet not connected or CA not initialized");
      return;
    }
    setIsCATransferring(true);
    try {
      const { toAddress, amount } = transferData;
      if (!toAddress || !amount) {
        setToastMessage("Please fill all fields");
        return;
      }
      const amountInNanoETH = bn(parseFloat(amount) * 1e9);
      const assetId = await wallet.provider.getBaseAssetId();
      const { provider, connector: CAconnector } = await ca.getFuelWithCA();
      const address = CAconnector.currentAccount();
      if (!address) {
        throw new Error("No account selected in CA connector");
      }
      const CAaccount = new Account(address, provider, CAconnector);
      const transactionRequest = await CAaccount.createTransfer(toAddress, amountInNanoETH, assetId);
      const response = await CAaccount.transfer(toAddress, amountInNanoETH.toString(), assetId);
      if (!response || !response.id) {
        throw new Error("Transaction response missing or invalid");
      }
      setToastMessage(`Successfully sent ${amount} ETH. Tx ID: ${response.id}`);
      setIsCAModalOpen(false);
      setTransferData({ toAddress: "", amount: "" });
      await refreshMyBalance();
    } catch (err) {
      console.error("Transfer failed:", err);
      setToastMessage("Transfer failed: " + (err.message || "Unknown error"));
    } finally {
      setIsCATransferring(false);
    }
  };

  const onIncrementPressed = async () => {
    if (!contract) {
      setToastMessage("Contract not loaded");
      return;
    }
    try {
      await contract.functions.increment().call();
      await getCount(contract);
    } catch (error) {
      console.error("Failed to increment counter:", error);
      setToastMessage("Failed to increment counter");
    }
  };

  const onDisconnectPressed = async () => {
    try {
      disconnect();
      setIsCAFuelEnabled(false);
      setUnifiedBalance(null);
      setShowBalancePopup(false);
      setToastMessage("Disconnected successfully");
    } catch (error) {
      console.error("Disconnect failed:", error);
      setToastMessage("Failed to disconnect");
    }
  };

  const handleShowUnifiedBalance = async () => {
    if (!isCAinitialized) {
      setError("CA SDK not initialized");
      setToastMessage("CA SDK not initialized");
      return;
    }
    if (!isConnected || !wallet || !isValidAddress(wallet.address.toAddress())) {
      setError("Please connect a valid wallet");
      setToastMessage("Please connect a valid wallet");
      return;
    }
    try {
      let balances: UnifiedBalancesResponse = await ca.getUnifiedBalances();
      if (Array.isArray(balances)) {
        balances = { totalBalances: balances };
      }
      if (Array.isArray(balances.totalBalances)) {
        const totalFiat = balances.totalBalances.reduce(
          (sum: number, token: TokenBalance) => sum + (typeof token.balanceInFiat === 'number' ? token.balanceInFiat : 0),
          0
        );
        setChainBalances({
          totalFiat,
          tokens: balances.totalBalances,
        });
        setShowBalancePopup(true);
        setError(null);
      } else {
        setChainBalances({
          totalFiat: 0,
          tokens: [],
        });
        setShowBalancePopup(true);
        setError(null);
      }
    } catch (err) {
      setError("Failed to fetch balances");
      setToastMessage("Failed to fetch balances");
      console.error("Balance fetch error:", err);
    }
  };

  const closeBalancePopup = () => {
    setShowBalancePopup(false);
    setChainBalances(null);
  };

  const openFuelModal = () => {
    setIsModalOpen(true);
    setIsCAModalOpen(false);
  };

  const openCAModal = () => {
    setIsCAModalOpen(true);
    setIsModalOpen(false);
  };

  const TitleSection = () => (
    <h1>Chain Abstraction Sample App</h1>
  );

  const FuelSection = () => (
    <div className="app-card fuel-color">
    <HeaderViteReactFuel/>
    {isConnected ? (
      <>
      <div>
      <h3>Counter</h3>
      <div>{counter ?? 0}</div>
        {balance && balance.toNumber() === 0 ? (
          <p>
            Get testnet funds from the{" "}
            <a
              target="_blank"
              rel="noopener noreferrer"
              href={`https://faucet-testnet.fuel.network/?address=${wallet?.address.toAddress()}`}
            >
              Fuel Faucet
            </a>{" "}
            to increment the counter.
          </p>
        ) : (
            <>
            <button className="app-button fuel-color" onClick={onIncrementPressed}>
              Increment Fuel Counter
            </button>
            <p>
              <button className="app-button fuel-color" onClick={() => setIsModalOpen(true)}>
                Send
              </button>
            </p>  
            <button className="app-button fuel-color" onClick={onDisconnectPressed}>
            Disconnect
            </button>
            </>
        )}
      <p>1. Balance: {formatBalance(myBalance)}</p>
      {renderAccounts(accounts || [], copiedIndex, copyToClipboard)}
      {toastMessage && (
      <div className="app-toast">
        {toastMessage}
      </div>
    )}
    {isModalOpen && (
      <div className="modal-overlay fuel-color">
        <div className="modal-content fuel-color">
          <span
            className="modal-close fuel-color "
            onClick={() => setIsModalOpen(false)}
          >
            ×
          </span>
          <h3>Send Transaction</h3>
          <div className="modal-field">
            <label>To Address</label>
            <input
              type="text"
              name="toAddress"
              value={transferData.toAddress}
              onChange={handleInputChange}
              placeholder="Enter recipient address"
            />
          </div>
          <div className="modal-field">
            <label>Amount (ETH)</label>
            <input
              type="number"
              name="amount"
              value={transferData.amount}
              onChange={handleInputChange}
              placeholder="Enter amount"
              step="0.000001"
            />
          </div>
          <button
            className="app-button fuel-color"
            onClick={handleFuelTransfer}
            disabled={isTransferring}
          >{isTransferring ? "Sending..." : "Submit"}
          </button>
        </div>
      </div>
    )}  
    </div>
    </>
    ) : (
          <>
          <button className="app-button fuel-color"
          onClick={() => {
            connect('Fuel wallet');
          }}
          >
          {isConnecting ? "Connecting" : "Connect"}
          </button>
          </>
    )}
    </div>
  );

  const ArcanaFuelSection = () => (
    <div className="app-card arcana-color">
      <HeaderViteReactArcana />
      {isConnected ? (
        <>
          <h3>Unified Balance</h3>
          <p>Chain Abstracted Transactions</p>
          {unifiedBalance ? (
            <div>
              <p>Total Fiat: ${unifiedBalance.totalFiat.toFixed(2)}</p>
              <ul>
                {unifiedBalance.individualBalances.map((token, index) => (
                  <li key={index}>
                    {token.tokenName || `Token ${index + 1}`}: ${token.balanceInFiat.toFixed(2)} ({token.balance || "N/A"})
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p>No unified balance available</p>
          )}
          {balance && balance.toNumber() === 0 ? (
            <>
              <p>
                Get testnet funds from the{" "}
                <a
                  target="_blank"
                  rel="noopener noreferrer"
                  href={`https://faucet-testnet.fuel.network/?address=${wallet?.address.toAddress()}`}
                >
                  Fuel Faucet
                </a>{" "}
                to increment the counter.
              </p>
              <p>Address: {wallet?.address.toAddress()}</p>
              <p>
                Account Details: {accounts && accounts.length > 0 ? accounts.join(", ") : "Loading..."}
              </p>
            </>
          ) : (
            <>
              <p>
                <button className="app-button arcana-color" onClick={handleShowUnifiedBalance}>
                  U-Balance
                </button>
              </p>
              <p>
                <button className="app-button arcana-color" onClick={openCAModal}>
                  Send
                </button>
              </p>
              <p>
                <button className="app-button arcana-color" onClick={onDisconnectPressed}>
                  Disconnect
                </button>
              </p>
            </>
          )}
          <p>Balance: {formatBalance(myBalance)}</p>
          {renderAccounts(accounts, copiedIndex, copyToClipboard)}
          {toastMessage && (
            <div className="app-toast">{toastMessage}</div>
          )}
          {error && (
            <div className="app-error">{error}</div>
          )}
          {isCAModalOpen && (
            <div className="modal-overlay arcana-color">
              <div className="modal-content arcana-color">
                <span
                  className="modal-close arcana-color"
                  onClick={() => setIsCAModalOpen(false)}
                >
                  ×
                </span>
                <h3>Send Transaction</h3>
                <div className="modal-field">
                  <label>To Address</label>
                  <input
                    type="text"
                    name="toAddress"
                    value={transferData.toAddress}
                    onChange={handleInputChange}
                    placeholder="Enter recipient address"
                  />
                </div>
                <div className="modal-field">
                  <label>Amount (ETH)</label>
                  <input
                    type="number"
                    name="amount"
                    value={transferData.amount}
                    onChange={handleInputChange}
                    placeholder="Enter amount"
                    step="0.000001"
                  />
                </div>
                <button
                  className="app-button arcana-color"
                  onClick={handleCATransfer}
                  disabled={isCATransferring}
                >
                  {isCATransferring ? "Sending..." : "Submit"}
                </button>
              </div>
            </div>
          )}
          {showBalancePopup && chainBalances && (
            <div className="modal-overlay arcana-color">
              <div className="modal-content arcana-color">
                <span
                  className="modal-close arcana-color"
                  onClick={closeBalancePopup}
                >
                  ×
                </span>
                <h3>Unified Balances</h3>
                <p>Total Fiat: ${chainBalances.totalFiat.toFixed(2)}</p>
                <ul>
                  {chainBalances.tokens.map((token, index) => (
                    <li key={index}>
                      {token.tokenName || `Token ${index + 1}`}: ${token.balanceInFiat.toFixed(2)} ({token.balance || "N/A"})
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </>
      ) : (
        <button
          className="app-button arcana-color"
          onClick={() => {
            connect("Fuel wallet");
            console.log("Connecting to Fuel wallet and initializing CA");
            initCA();
          }}
        >
          {isConnecting ? "Connecting" : "Connect"}
        </button>
      )}
    </div>
  );

  const HeaderCommon = () => (
    <div>
      <a href="https://vite.dev" target="_blank">
        <img src={viteLogo} className="logo" alt="Vite logo" />
      </a>
      <a href="https://react.dev" target="_blank">
        <img src={reactLogo} className="logo react" alt="React logo" />
      </a>
    </div>
  );

  const HeaderViteReact = () => (
    <div className="app-card">
      <HeaderCommon />
      <h2>Vite + React</h2>
      <div className="card">
        <button className="app-button" onClick={() => setCount((count) => count + 1)}>
          count is {count}
        </button>
        <p>
          Edit <code>src/App.tsx</code> and save to test HMR
        </p>
      </div>
      <p className="read-the-docs">
        Click on the Vite and React logos to learn more
      </p>
    </div>
  );

  const HeaderViteReactFuel = () => (
    <>
        <HeaderCommon />
        <a href="https://docs.fuel.network/docs/" target="_blank">
          <img src="https://avatars.githubusercontent.com/u/55993183" className="logo" alt="Fuel logo" />
        </a>
        <h2>V + R + Fuel</h2>
        <p className="read-the-docs">
          Click on the Fuel logo to learn more
        </p>
    </>
  );

  const HeaderViteReactArcana = () => (
    <>
      <HeaderCommon />
      <a href="https://docs.fuel.network/docs/" target="_blank">
        <img src="https://avatars.githubusercontent.com/u/55993183" className="logo" alt="Fuel logo" />
      </a>
      <a href="https://docs.arcana.network/" target="_blank">
        <img src="https://avatars.githubusercontent.com/u/82495837" className="logo-arcana" alt="Arcana logo" />
      </a>
      <h2>V + R + F + Arcana</h2>
      <p className="read-the-docs">
        Click on the Arcana logo to learn more
      </p>
    </>
  );

  return (
    <>
      <TitleSection />
      <div className="container">
        <HeaderViteReact />
        <FuelSection />
        <ArcanaFuelSection />
      </div>
    </>
  );
}

export default App;