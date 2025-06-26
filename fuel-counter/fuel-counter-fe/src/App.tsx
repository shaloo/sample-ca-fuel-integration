
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'

// Integrate Fuel
//import { useState } from 'react'
import { bn, Account } from 'fuels';
import { CA } from '@arcana/ca-sdk';  //Arcana CA SDK
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
import { CounterContract } from "./sway-api";

// REPLACE WITH YOUR CONTRACT ID (Testnet/Mainnet)
/*
const CONTRACT_ID =
  "0x758a12eaead76c10aa1e3160dc993cb46b0c70931a62fcba1f705b2bdccf4013";
*/

//Mainnet counter contract
const CONTRACT_ID =
"0xc16c75d511431ee5568c36e0bad44b1763ba1fdecec056450062d35fe16ff3b0";

const COPY_TIMEOUT = 2000;

function App() {

  const [count, setCount] = useState(0);
  // Integrate Fuel
  const [contract, setContract] = useState<CounterContract>();
  const [counter, setCounter] = useState<number>();
  const { connect } = useConnect();
  const { isConnected } = useIsConnected();
  const { isConnecting } = useConnectUI();
  const { disconnect } = useDisconnect();
  const { wallet } = useWallet();
  const  { connectors } = useConnectors();
  const { accounts } = useAccounts();
  const { sendTransaction } = useSendTransaction();
  /* useBalance doesn't  seem to work */
  const { balance } = useBalance({
    address: wallet?.address.toAddress(),
    assetId: wallet?.provider.getBaseAssetId(),
  });

  const [isCAinitialized, setIsCAinitialized] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [myBalance, setMyBalance] = useState<number | undefined>(undefined);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCAModalOpen, setIsCAModalOpen] = useState(false);
  const [transferData, setTransferData] = useState({ toAddress: 
    "", amount: "" });
  const [isTransferring, setIsTransferring] = useState(false); // Custom loading state
  const [isCATransferring, setIsCATransferring] = useState(false); // Custom loading state

  //Integrate CA SDK

  const EVMprovider = window.ethereum;
  const ca = new CA();
    
  //Initialize CA
  const initCA = async () => {
    //Set the EVM provider  
    ca.setEVMProvider(EVMprovider);

    console.log("CA is initialized with EVMProvider");
    //Init CA object
    await ca.init();
    setToastMessage("CA init is called with EVMProvider");
    setIsCAinitialized(true);

  };

  const enableCAinFuel = async () => {
    //Set Fuel connector in CA
    console.log ("Logging available connectors: ", connectors);
    setToastMessage("Setting Fuel Connector");
    const fuelConn = connectors[0];
    console.log ("fuelconn.name: ", fuelConn.name);
    await ca.setFuelConnector(fuelConn);
    console.log("Fuel Connector is set in CA"); 
  };

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

  // Reusable function to render accounts
  const renderAccounts = (accounts: string[], copiedIndex: number | null,  
    copyFn: (text: string, index: number) => void) => {
    return accounts && accounts.length > 0 ? (
      accounts.map((account, index) => {
        const displayText =
          account.length > 8
            ? `${account.slice(0, 5)}...${account.slice(-3)}`
            : account;
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
      setToastMessage("counter value: " + value.toNumber());
      setCounter(value.toNumber());
    } catch (error) {
      console.error(error);
    }
  };

  // Combined useEffect for counter and balance state
  useEffect(() => {
    async function initializeData() {
      if (isConnected && wallet && wallet.provider) {
        try {
          // Get counter
          const counterContract = new CounterContract(CONTRACT_ID, wallet);
          await getCount(counterContract);
          setContract(counterContract);
          await refreshMyBalance();

        } catch (error) {
          console.error("Error initializing data:", error);
          setMyBalance(undefined); // Reset on error
          setContract(undefined); // Optional: reset contract on error
          setCounter(undefined); // Optional: reset counter on error
          setIsCAinitialized(false);
        }
      }
    }

    initializeData();
  }, [isConnected, wallet]); 


  // Function to format balance from wei to ETH
  const formatBalance = (balanceWei?: number) => {
    if (balanceWei === undefined) return "Loading...";
    const ethValue = balanceWei / 1e9; // Convert wei to ETH
    return `${ethValue.toFixed(9)} ETH`; // Limit to 6 decimal places for readability
  };

  // Function to fetch and update myBalance
  const refreshMyBalance = async () => {
    if (wallet && wallet.provider) {
      try {
        const assetId = await wallet.provider.getBaseAssetId();
        const balanceBN = await wallet.getBalance(assetId);
        setMyBalance(balanceBN.toNumber());
      } catch (error) {
        console.error("Failed to refresh balance:", error);
        setMyBalance(undefined);
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
      if ( !toAddress || !amount) {
        setIsTransferring(false);
        setToastMessage("Please fill all fields");
        return;
      }
      const amountInNanoETH = bn(parseFloat(amount) * 1e9); 
      const assetId = await wallet.provider.getBaseAssetId(); 
      console.log("Creating transfer with:", { toAddress, 
        amountInNanoETH:amountInNanoETH.toString(), assetId });
      const transactionRequest = await wallet.createTransfer(toAddress, 
        amountInNanoETH, assetId);
      console.log("Transaction Request:", transactionRequest);

      const response = await wallet.sendTransaction(transactionRequest);
      if (!response || !response.id) {
        throw new Error("Transaction response missing or invalid");
      }
      console.log("Using wallet.SendTransaction Response:", response);
      setToastMessage(`Successfully sent ${amount} ETH. Tx ID: ${response.id}`);
      setIsModalOpen(false);
      setTransferData({ toAddress: "", amount: "" });
      await refreshMyBalance();
    } catch (err) {
      console.error("Transfer failed:", err);
      setToastMessage("Transfer failed: " + (err.message || "Unknown error"));
    } finally {
      setIsTransferring(false); // End loading
    }
  };

  const handleCATransfer = async () => {
    setToastMessage("Handling CA Send");
    if (!wallet || !isCAinitialized) {
      setToastMessage("Wallet not connected or CA not initialized");
      return;
    }
    setIsCATransferring(true);

    enableCAinFuel();

    const { provider, connector: CAconnector } = await ca.getFuelWithCA();
    const address = CAconnector.currentAccount()!;
    console.log("CAconnector.currentAccount(): ", address);

    const CAaccount = new Account(address, provider, CAconnector);

    try {
      const { toAddress, amount } = transferData;
      if ( !toAddress || !amount) {
        setIsCATransferring(false);
        setToastMessage("Please fill all fields");
        return;
      }
      
      const amountInNanoETH = bn(parseFloat(amount) * 1e9); 
      const assetId = await wallet.provider.getBaseAssetId(); 
      console.log("Creating transfer with:", { toAddress, 
        amountInNanoETH:amountInNanoETH.toString(), assetId });
      const transactionRequest = await wallet.createTransfer(toAddress, 
        amountInNanoETH, assetId);
      console.log("Transaction Request:", transactionRequest);
      
      /*
      const response = await wallet.sendTransaction(transactionRequest)
      //console.log("Using wallet.SendTransaction Response:", response);
      */
      const response = await CAaccount.transfer(
        toAddress,
        amountInNanoETH.toString(),
        assetId,
      );
      if (!response || !response.id) {
        throw new Error("Transaction response missing or invalid");
      }
      console.log("Using account.transfer Response:", response);
      setToastMessage(`Successfully sent ${amount} ETH. Tx ID: ${response.id}`);
      
      //setToastMessage("CA SDKs not yet integrated!!!! Dummy Send");
      setIsCAModalOpen(false);
      setTransferData({ toAddress: "", amount: "" });
      await refreshMyBalance();
    } catch (err) {
      console.error("Transfer failed:", err);
      setToastMessage("Transfer failed: " + (err.message || "Unknown error"));
    } finally {
      setIsCATransferring(false); // End loading
    }

    console.log("Using wallet:", wallet);
    console.log("Fn: Not available yet!!!! ca-sdk, ca-wagmi not yet integrated!");
  }
  const onIncrementPressed = async () => {
    if (!contract) {
      return alert("Contract not loaded");
    }
    try {
      await contract.functions.increment().call();
      await getCount(contract);
    } catch (error) {
      console.error(error);
    }
  };

  const onDisconnectPressed = async () => {
    try {
      disconnect();
    } catch (error) {
      console.error(error);
    }
  }

  /* App React components */

  const TitleSection = () => (
    <h1>Chain Abstraction Sample App</h1>
  );

  const HeaderCommon = () => (
    <>
    <div>
      <a href="https://vite.dev" target="_blank">
        <img src={viteLogo} className="logo" alt="Vite logo" />
      </a>
      <a href="https://react.dev" target="_blank">
        <img src={reactLogo} className="logo react" alt="React logo" />
      </a>
      </div>
    </>
  );

  const HeaderViteReact = () => (
    <>
    <div className="app-card">
      <div> 
        <HeaderCommon/>
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
    </div>
    </>
  );

  const HeaderViteReactFuel = () => (
    <>
      <div> 
        <HeaderCommon/>
        <a href="https://docs.fuel.network/docs/" target="_blank">
          <img src="https://avatars.githubusercontent.com/u/55993183" className="logo" alt="Fuel logo" />
        </a> 
      </div>
      <h2>V + R + Fuel</h2>
      <p className="read-the-docs">
        Click on the Fuel logo to learn more
      </p>
    </> 
  );

  const HeaderViteReactArcana = () => (
    <>
      <div>
        <HeaderCommon/>
        <a href="https://docs.fuel.network/docs/" target="_blank">
          <img src="https://avatars.githubusercontent.com/u/55993183" className="logo" alt="Fuel logo" />
        </a> 
        <a href="https://docs.arcana.network/" target="_blank">
          <img src="https://avatars.githubusercontent.com/u/82495837" className="logo-arcana" alt="Arcana logo" />
        </a> 
      </div>
      <h2>V + R + F + Arcana</h2>
      <p className="read-the-docs">
        Click on the Arcana logo to learn more
      </p>
    </> 
  );

  return (
    <>
      <TitleSection/>
      <div className="container">
        <HeaderViteReact/>
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
                    Increment Fuel Counter [{counter}]
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
                >
                  {isTransferring ? "Sending..." : "Submit"}
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
        <div className="app-card arcana-color">
          <HeaderViteReactArcana/>
          {isConnected ? (
            <>
            <div>
              <h3>Unified Balance</h3>
              <p>Chain Abstracted Transactions</p>
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
                    Account Details: {accounts && accounts !== undefined ? accounts : "Loading..."}
                  </p>
                </>
                ) : (
                  <>
                  <p>
                    <button className="app-button arcana-color" onClick={() => setIsCAModalOpen(true)}>
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
              <p>1. Balance: {formatBalance(myBalance)}</p>
              {renderAccounts(accounts || [], copiedIndex, copyToClipboard)}
              {toastMessage && (
                <div className="app-toast">
                  {toastMessage}
                </div>
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
            </div>
            </>
          ) : (
            <>
              <button className="app-button arcana-color"
              onClick={() => {
                connect('Fuel wallet');
                initCA();
              }}
            >
              {isConnecting ? "Connecting" : "Connect"}
            </button>
          </>
          )}
        </div>
      </div> 
    </>
  )
}

export default App
