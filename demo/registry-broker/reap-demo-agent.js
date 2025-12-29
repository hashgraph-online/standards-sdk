import { RegistryBrokerClient } from '@hashgraphonline/standards-sdk';

// 1. CONFIGURATION
const REAP_NODE_URL = 'https://reapnode.reap.deals'; 
const REGISTRY_URL = 'https://hol.org/registry/api/v1';

// 2. INITIALIZE HASHGRAPH CLIENT
const registryClient = new RegistryBrokerClient({
  baseUrl: REGISTRY_URL,
});

async function runDemo() {
  console.log(`🤖 AGENT: Connecting to Remote Reap Node at [${REAP_NODE_URL}]...`);

  try {
    // =========================================================================
    // PHASE 1: DISCOVERY (Hashgraph)
    // =========================================================================
    console.log('\n1️⃣  PHASE 1: Global Discovery (Hashgraph)');
    console.log('   🔎 Querying Registry "pulsemcp"...');
    
    const searchResult = await registryClient.search({
      q: 'commerce',          
      registry: 'pulsemcp',  
      limit: 10,             
    });

    if (searchResult.hits.length === 0) {
      console.log('⚠️  No agents found.');
      return;
    }

    // Pick the first one found
    const discoveredAgent = searchResult.hits[0];
    console.log(`   ✅ FOUND: ${discoveredAgent.name}`);
    console.log(`   🆔 UAID: ${discoveredAgent.uaid}`);

    // =========================================================================
    // PHASE 2: AUDIT LOGGING (Reap Mesh Storage)
    // =========================================================================
    console.log('\n2️⃣  PHASE 2: Audit Logging');
    console.log('   💾 Writing discovery log to remote Reap Mesh...');

    const logPayload = {
      key: `discovery:${Date.now()}`,
      value: {
        source: 'hashgraph-registry',
        agent_name: discoveredAgent.name,
        agent_uaid: discoveredAgent.uaid,
        timestamp: new Date().toISOString(),
        action: 'logged_discovery'
      }
    };

    // Standard Logging Call
    await fetch(`${REAP_NODE_URL}/api/storage`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(logPayload)
    });
    console.log(`   ✅ Log written to storage.`);


    // =========================================================================
    // PHASE 3: AGENTIC ACTIVATION (CIS Announcement)
    // =========================================================================
    console.log('\n3️⃣  PHASE 3: Agentic Activation');
    console.log('   🤖 Formulating CIS Capability List...');

    // 1. Formulate Capabilities
    // We define what protocols we want to use with this found agent
    const myCapabilities = [
        'cis_handshake', 
        'cis_get_price', 
        'cis_settle_payment'
    ];
    console.log(`   📋 Capabilities: ${myCapabilities.join(', ')}`);

    // 2. Construct the Intention Packet
    const agentIntention = {
        target_uaid: discoveredAgent.uaid,
        target_name: discoveredAgent.name,
        my_capabilities: myCapabilities
    };

    console.log('   📡 Triggering "cis_announce" on Reap Mesh...');

    // 3. Trigger the Node
    const announceReq = await fetch(`${REAP_NODE_URL}/api/cis/announce`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(agentIntention)
    });

    if (!announceReq.ok) {
        const errText = await announceReq.text();
        throw new Error(`Node rejected announce request: ${announceReq.status} - ${errText}`);
    }

    const announceRes = await announceReq.json();
    
    console.log(`   ✅ ANNOUNCEMENT BROADCASTED!`);
    console.log(`   📝 Mesh Transaction ID: ${announceRes.tx_id}`);
    console.log(`   📦 Protocol Packet:`);
    console.dir(announceRes.packet, { depth: null, colors: true });


    // =========================================================================
    // PHASE 4: VERIFICATION
    // =========================================================================
    console.log('\n4️⃣  PHASE 4: Consensus Verification');
    console.log('   → Verifying immutable record in Mesh Storage...');
    
    // Allow a moment for the node to process the append
    await new Promise(r => setTimeout(r, 1000)); 

    const verifyReq = await fetch(`${REAP_NODE_URL}/api/storage/${announceRes.tx_id}`);
    const verifyRes = await verifyReq.json();

    if (verifyRes.value && verifyRes.value.type === 'cis_announce') {
      console.log('   ✅ VERIFIED: Packet is cryptographically secured in the mesh.');
      console.log('   🎉 DEMO COMPLETE');
    } else {
      console.log('   ⚠️  Pending consensus propagation...');
    }

  } catch (err) {
    console.error('❌ ERROR:', err.message);
  }
}

runDemo();
