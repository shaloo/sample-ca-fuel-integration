import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { CA } from '@arcana/ca-sdk';  //Arcana CA SDK

//Integrate Fuel
import { FuelProvider } from "@fuels/react";
//import { defaultConnectors } from "@fuels/connectors";
import { Fuel } from 'fuels';
import { defaultConnectors, FuelWalletConnector } from '@fuels/connectors';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
 
//Integrate CA SDK
const provider = window.ethereum;
const ca = new CA();
//Set the EVM provider  
ca.setEVMProvider(provider);

//Initialize CA
await ca.init();

const queryClient = new QueryClient();

const fuelConn = new FuelWalletConnector();
//Use custom Fuel wallet connector
//const fuelConn = new Fuel({
//  connectors: [new FuelWalletConnector()],
//});

//connector refers to https://github.com/FuelLabs/fuel-connectors/wiki
//await ca.setFuelConnector(fuelConn);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <FuelProvider
       fuelConfig={{
        //connectors: defaultConnectors({ devMode: true }),
        connectors: [fuelConn], 
       }}
      >
        <App />
      </FuelProvider>
    </QueryClientProvider>
  </StrictMode>
);


    /* Integrate Fuel */

    /*
    fuelConfig={{
      connectors: defaultConnectors(//{ devMode: true }
      ),
      // providerUrl: 'https://testnet.fuel.network/v1/graphql',
    }}
    */
   /*
    fuelConfig={{
        connectors: [fuelConn],
       }}
    */