import { useState } from 'react';
import Graph from "react-graph-vis";
import { v4 as uuidv4 } from "uuid";
import Head from 'next/head'
import styles from '../styles/Home.module.css'

// Graph options
const options = {
  layout: {
    hierarchical: {
      enabled: false,
    },
    // you can also add a fixed randomSeed to keep the initial layout deterministic
    // randomSeed: 42,
  },
  edges: {
    color: "#ABABAB"
  },
  nodes: {
    color: "#BBBBBB",
    // tell vis.js to never move nodes once they’re placed
    fixed: { x: true, y: true }
  },
  physics: {
    enabled: false   // turn off all physics
  },
  interaction: {
    multiselect: false,
    dragView: false,
    // optional: prevent dragging nodes by hand
    dragNodes: false,
    // optional: prevent zooming/panning if you want truly static
    // zoomView: false
  }
};

// Default graph data
const defaultGraph = {
  nodes: [
    { id: 1, label: "Start", title: null }
  ],
  edges: []
};

// Default DFA specification
const defaultDfaSpec = `SPEC_DFA = {
    'alphabet': {'0', 'A', 'C'},
    'states': {'q0', 'q1', 'q2', 'q3', 'q4', 'q5'},
    'initial_state': 'q0',
    'accepting_states': {'q3'},
    'transitions': {
        ('q0', 'C'): 'q0',
        ('q0', 'A'): 'q1',
        ('q0', '0'): 'q4',

        ('q1', 'C'): 'q2',
        ('q1', 'A'): 'q1',
        ('q1', '0'): 'q4',

        ('q2', 'A'): 'q1',
        ('q2', '0'): 'q3',
        ('q2', 'C'): 'q0',

        ('q3', '0'): 'q4',
        ('q3', 'A'): 'q1',
        ('q3', 'C'): 'q0',

        ('q4', 'C'): 'q5',
        ('q4', '0'): 'q4',
        ('q4', 'A'): 'q1',

        ('q5', 'C'): 'q0',
        ('q5', 'A'): 'q3',
        ('q5', '0'): 'q4',
    }
}`;

export default function Home() {
  const [graphData, setGraphData] = useState(defaultGraph);
  const [graphVersion, setGraphVersion] = useState(1); // track when we really want to recreate the network
  const [firstNode, setFirstNode] = useState(1);
  const [secondNode, setSecondNode] = useState(1);
  const [inputString, setInputString] = useState('');
  const [dfaSpecification, setDfaSpecification] = useState('');
  const [animationEnabled, setAnimationEnabled] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [animationStep, setAnimationStep] = useState(0);
  // Store a clean copy of the graph data before animations
  const [cleanGraphData, setCleanGraphData] = useState(defaultGraph);
  // Store original DFA specification for rebuilding
  const [originalDfaSpec, setOriginalDfaSpec] = useState('');
  
  // Parse DFA specification and build the graph
  const parseDfaSpecification = (specText, storeAsOriginal = true) => {
    try {
      // Use passed specText or fallback to dfaSpecification state
      const textToUse = specText || dfaSpecification;
      
      // Ensure we have a string to work with
      if (!textToUse || typeof textToUse !== 'string') {
        throw new Error("DFA specification must be a string");
      }

      // Extract the DFA specification from the text if it's not already extracted
      let specToUse = textToUse;
      if (!textToUse.startsWith('SPEC_DFA')) {
        const specMatch = textToUse.match(/SPEC_DFA\s*=\s*\{([\s\S]*)\}/);
        if (!specMatch) throw new Error("Invalid DFA specification format");
        specToUse = specMatch[0];
      }
      
      // If this is the first build (not a reset), store the original spec
      if (storeAsOriginal) {
        setOriginalDfaSpec(specToUse);
      }
      
      // Parse alphabet
      const alphabetMatch = specToUse.match(/'alphabet':\s*\{([^}]*)\}/);
      if (!alphabetMatch) throw new Error("Could not find alphabet in specification");
      
      // Parse states
      const statesMatch = specToUse.match(/'states':\s*\{([^}]*)\}/);
      if (!statesMatch) throw new Error("Could not find states in specification");
      
      // Parse initial state
      const initialStateMatch = specToUse.match(/'initial_state':\s*'([^']*)'/);
      if (!initialStateMatch) throw new Error("Could not find initial state in specification");
      const initialState = initialStateMatch[1];
      
      // Parse accepting states
      const acceptingStatesMatch = specToUse.match(/'accepting_states':\s*\{([^}]*)\}/);
      if (!acceptingStatesMatch) throw new Error("Could not find accepting states in specification");
      
      const acceptingStates = acceptingStatesMatch[1].split(',').map(s => {
        const match = s.match(/'([^']*)'/);
        return match ? match[1] : null;
      }).filter(s => s !== null);
      
      // Parse transitions
      const transitionsText = specToUse.substring(specToUse.indexOf("'transitions'"));
      const transitionRegex = /\('([^']*)',\s*'([^']*)'\):\s*'([^']*)'/g;
      
      const transitions = [];
      let transitionMatch;
      while ((transitionMatch = transitionRegex.exec(transitionsText)) !== null) {
        transitions.push({
          from: transitionMatch[1],
          input: transitionMatch[2],
          to: transitionMatch[3]
        });
      }
      
      // Extract all states from the specification
      const stateNames = statesMatch[1].split(',').map(s => {
        const match = s.match(/'([^']*)'/);
        return match ? match[1] : null;
      }).filter(s => s !== null);
      
      // Create new graph
      const newGraph = {
        nodes: [],
        edges: []
      };
      
      // Add nodes
      const stateIdMap = {};
      stateNames.forEach((state, index) => {
        const id = index + 1;
        const label = state;
        const isAccepting = acceptingStates.includes(state);
        
        stateIdMap[state] = id;
        
        newGraph.nodes.push({
          id: id,
          label: label,
          title: isAccepting ? 'accepting' : null,
          borderWidth: isAccepting ? 3 : 1,
          color: isAccepting ? { border: '#000000' } : undefined
        });
      });
      
      // Add edges (with unique id!)
      transitions.forEach(transition => {
        const fromId = stateIdMap[transition.from];
        const toId   = stateIdMap[transition.to];
        const label  = transition.input;

        // Check if edge already exists
        const existingEdge = newGraph.edges.find(edge =>
          edge.from === fromId && edge.to   === toId
        );

        if (existingEdge) {
          // Add label to existing edge
          if (!existingEdge.label.includes(label)) {
            existingEdge.label = existingEdge.label + ", " + label;
          }
        } else {
          // Create new edge (give it an `id`!)
          newGraph.edges.push({
            id: uuidv4(),            // ← unique edge id
            from: fromId,
            to:   toId,
            label,
            smooth: { enabled: true, type: 'curvedCW', roundness: 1 }
          });
        }
      });
      
      // Update graph data and keep a clean copy
      setGraphData(newGraph);
      setCleanGraphData(JSON.parse(JSON.stringify(newGraph))); 
      setGraphVersion(v => v + 1);
      setFirstNode(1);
      setSecondNode(1);
      
    } catch (error) {
      alert(`Error parsing DFA specification: ${error.message}`);
    }
  };
  
  const addNewState = (accptingState) => {
    let newGraph = JSON.parse(JSON.stringify(graphData));
    const ids = newGraph.nodes.map(x => x.id);
    const newId = Math.max(...ids) + 1;
    newGraph.nodes.push(accptingState ?
      { id: newId, label: `Q${newId}`, borderWidth: 3, color: { border: '#000000' }, title: 'accepting' }
      : { id: newId, label: `Q${newId}`, title: null }
    );
    setGraphData(newGraph);
    setCleanGraphData(JSON.parse(JSON.stringify(newGraph))); // Store clean copy
    updateDfaSpecFromGraph(newGraph); // Update the spec
    setGraphVersion(v => v + 1); // bump version on structural change
  }

  const addEdge = (nodeId1, nodeId2, label = '0') => {
    let newGraph = JSON.parse(JSON.stringify(graphData));

    // Check if edge exists already
    const existingEdge       = newGraph.edges.find(x => x.from === +nodeId1 && x.to === +nodeId2);
    const existingOutTransition = newGraph.edges.find(x => x.from === +nodeId1 && x.label.includes(label)); 

    if (existingEdge) {
      if (!existingEdge.label.includes(label)) {
        existingEdge.label = existingEdge.label + ", " + label;
      }
    } else if (existingOutTransition) {
      const fromNode = newGraph.nodes.find(x => x.id === nodeId1);
      alert(`${fromNode.label} has a transition with value ${label} already`);
    } else {
      newGraph.edges.push({
        id: uuidv4(),            // ← unique edge id again
        from: +nodeId1,
        to:   +nodeId2,
        label,
        smooth: { enabled: true, type: 'curvedCW', roundness: 1 }
      });
    }
    setGraphData(newGraph);
    setCleanGraphData(JSON.parse(JSON.stringify(newGraph))); // Store clean copy
    updateDfaSpecFromGraph(newGraph); // Update the spec
    setGraphVersion(v => v + 1); // bump version on structural change
  };

  const handleState1Change = (event) => {
    setFirstNode(event.target.value);
  };

  const handleState2Change = (event) => {
    setSecondNode(event.target.value);
  }

  const resetGraph = () => {
    setGraphData(defaultGraph);
    setCleanGraphData(defaultGraph); // Reset clean copy too
    setOriginalDfaSpec(''); // Clear the original spec
    setGraphVersion(v => v + 1); // bump version on structural change
  };

  // Allow only A, C, and 0 characters
  const handleStringInput = (e) => e.target.value.match(/(^[AC0]+$|^$)/g) && setInputString(e.target.value);

  // Helper function to reset animation colors
  const resetAnimationColors = () => {
    // Create a completely new graph object instead of mutating the existing one
    const newGraph = {
      nodes: [],
      edges: []
    };
    
    // Recreate each node with proper styling based on accepting status
    graphData.nodes.forEach(node => {
      const newNode = {
        ...node, // Copy all basic properties
        color: node.title === 'accepting' 
          ? { border: '#000000' } // Only border for accepting states
          : undefined, // Default color for non-accepting states
        borderWidth: node.title === 'accepting' ? 3 : 1
      };
      newGraph.nodes.push(newNode);
    });
    
    // Recreate edges with no color styling
    graphData.edges.forEach(edge => {
      newGraph.edges.push({
        ...edge, // Copy all properties
        color: undefined // Reset color
      });
    });
    
    return newGraph;
  };

  // Animated check input string function
  const animateCheckInputString = async () => {
    setIsAnimating(true);
    setAnimationStep(0);

    let currNodeId = 1;
    let accepted = inputString.length > 0;

    // Start with one clean snapshot
    let displayGraph = JSON.parse(JSON.stringify(resetAnimationColors()));

    // Highlight the starting node
    const startNode = displayGraph.nodes.find(n => n.id === currNodeId);
    if (startNode) {
      startNode.color = { background: '#90CAF9' };
      setGraphData(JSON.parse(JSON.stringify(displayGraph)));
    }
    await new Promise(r => setTimeout(r, 1000));

    // Traverse automata step-by-step, mutating the same `displayGraph`
    for (let idx = 0; idx < inputString.length; idx++) {
      const value = inputString[idx];

      // Find the edge in our live displayGraph
      const nextEdge = displayGraph.edges.find(x => x.from === currNodeId && x.label.includes(value));
      if (!nextEdge) {
        accepted = false;
        alert(`No transition for ${value} from state ${currNodeId}`);
        break;
      }

      // Highlight the edge
      nextEdge.color = { color: '#1E88E5', highlight: '#1E88E5' };
      setGraphData(JSON.parse(JSON.stringify(displayGraph)));
      setAnimationStep(idx + 1);
      await new Promise(r => setTimeout(r, 1000));

      // Move to next node and highlight it
      currNodeId = nextEdge.to;
      const currNode = displayGraph.nodes.find(n => n.id === currNodeId);
      currNode.color = { background: '#90CAF9' };
      setGraphData(JSON.parse(JSON.stringify(displayGraph)));
      await new Promise(r => setTimeout(r, 1000));

      // If last char, do accept/reject color
      if (idx === inputString.length - 1) {
        accepted = currNode.title === 'accepting';
        currNode.color = { background: accepted ? '#A5D6A7' : '#EF9A9A' };
        setGraphData(JSON.parse(JSON.stringify(displayGraph)));
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    alert(accepted ? 'String accepted' : 'String not accepted');
    setIsAnimating(false);
  };

  const checkInputString = () => {
    if (animationEnabled) {
      animateCheckInputString();
    } else {
      let currNodeId = 1;
      let accepted = inputString.length > 0;

      // traverse automata according to input
      for (let idx = 0; idx < inputString.length; idx++) {
        const value = inputString[idx];
        let nextEdge = graphData.edges.find(x => x.from === currNodeId && x.label.includes(value));
        
        if (nextEdge) {
          currNodeId = nextEdge.to;
          
          // Check if last state is accepting state
          if (idx === inputString.length - 1) {
            const currNodeObj = graphData.nodes.find(x => x.id === currNodeId);
            accepted = !!currNodeObj.title && currNodeObj.title === "accepting";
          }
        } else {
          accepted = false;
          break;
        }
      }

      alert(accepted ? 'String accepted' : 'String not accepted');
    }
  }

  const makeStartStateAccepting = () => {
    let newGraph = JSON.parse(JSON.stringify(graphData));
    const startNode = newGraph.nodes.find(x => x.id === 1);
    startNode.borderWidth = 3;
    startNode.color = { border: '#000000' };
    startNode.title = 'accepting';

    setGraphData(newGraph);
    setCleanGraphData(JSON.parse(JSON.stringify(newGraph))); // Store clean copy
    updateDfaSpecFromGraph(newGraph); // Update the spec
    setGraphVersion(v => v + 1); // bump version on structural change
  }

  // Reset animations by rebuilding the DFA from the original specification
  const resetAnimations = () => {
    if (originalDfaSpec && originalDfaSpec.length > 0) {
      // Use the stored original DFA spec to rebuild the graph
      parseDfaSpecification(originalDfaSpec, false);
    } else {
      // If no original spec exists, just use the clean graph data
      setGraphData(JSON.parse(JSON.stringify(cleanGraphData)));
    }
  };

  // On manual edits to the DFA, also capture as specification
  const updateDfaSpecFromGraph = (newGraph) => {
    // Only do this for structural changes, not animations
    try {
      // Build a spec representation from the current graph
      const states = newGraph.nodes.map(n => `'${n.label}'`).join(', ');
      const acceptingStates = newGraph.nodes
        .filter(n => n.title === 'accepting')
        .map(n => `'${n.label}'`)
        .join(', ');
        
      const transitionsArray = [];
      newGraph.edges.forEach(e => {
        const fromNode = newGraph.nodes.find(n => n.id === e.from);
        const toNode = newGraph.nodes.find(n => n.id === e.to);
        
        // Handle comma-separated transition labels
        const labels = e.label.split(', ');
        labels.forEach(label => {
          transitionsArray.push(`('${fromNode.label}', '${label}'): '${toNode.label}'`);
        });
      });
      
      const spec = `SPEC_DFA = {
        'alphabet': {'A', 'C', '0'},
        'states': {${states}},
        'initial_state': 'Start',
        'accepting_states': {${acceptingStates}},
        'transitions': {
          ${transitionsArray.join(',\n          ')}
        }
      }`;
      
      setOriginalDfaSpec(spec);
    } catch (err) {
      console.error("Could not update DFA specification:", err);
    }
  };

  // Load the default DFA specification
  const loadDefaultDfa = () => {
    // Set the specification text in the textarea
    setDfaSpecification(defaultDfaSpec);
    // Parse and build the DFA
    parseDfaSpecification(defaultDfaSpec);
  };

  return (
    <div className={styles.container}>
      <Head>
        <title>Create Next App</title>
        <meta name="description" content="Generated by create next app" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className={styles.main}>
        <h1 className="m-5">DFA visualization tool</h1>

        <div style={{ width: '80vw' }}>
          <div className="form-group">
            <button className="btn btn-secondary m-2" onClick={resetGraph}>Reset DFA</button>
            <button className="btn btn-secondary m-2" onClick={resetAnimations}>Reset Animations</button>
            <button className="btn btn-secondary m-2" onClick={() => addNewState()}>Add new state</button>
            <button className="btn btn-secondary m-2" onClick={() => addNewState(true)}>Add new accepting state</button>
            <button className="btn btn-secondary m-2" onClick={() => makeStartStateAccepting()}>Make start state accepting</button>
            <button className="btn btn-primary m-2" onClick={loadDefaultDfa}>Load Default DFA</button>
          </div>

          <div className="row">
            <div className="form-group col-sm-3 m-2">
              <label>Pick state 1:</label>
              <select value={firstNode} className="form-control" onChange={handleState1Change}>
                {graphData.nodes.map(node => <option key={uuidv4()} value={node.id}>{node.label}</option>)}
              </select>
            </div>
            <div className="form-group col-sm-3 m-2">
              <label>Pick state 2:</label>
              <select value={secondNode} className="form-control" onChange={handleState2Change}>
                {graphData.nodes.map(node => <option key={uuidv4()} value={node.id}>{node.label}</option>)}
              </select>
            </div>
            <div className="form-group col-sm-3 m-2 d-flex">
              <div className="btn-group align-self-end" role="group" aria-label="Add edge">
                <input type="button" className="btn btn-primary" onClick={() => addEdge(firstNode, secondNode, '0')} value="Add 0 transition" />
                <input type="button" className="btn btn-primary" onClick={() => addEdge(firstNode, secondNode, 'A')} value="Add A transition" />
                <input type="button" className="btn btn-primary" onClick={() => addEdge(firstNode, secondNode, 'C')} value="Add C transition" />
              </div>  
            </div>
          </div>

          <div className="row">
            <div className="form-group col-sm-6 m-2">
              <label>Input string (A, C, 0): </label>
              <input type="text" value={inputString}
                className="form-control"
                onChange={handleStringInput} 
                placeholder="Enter A, C, 0 characters..." />
            </div>
            <div className="form-group col-sm-2 m-2">
              <div className="form-check">
                <input 
                  type="checkbox" 
                  className="form-check-input" 
                  id="animationCheck" 
                  checked={animationEnabled}
                  onChange={(e) => setAnimationEnabled(e.target.checked)}
                  disabled={isAnimating}
                />
                <label className="form-check-label" htmlFor="animationCheck">
                  Animate String Check
                </label>
              </div>
            </div>
            <div className="form-group col-sm-4 d-flex m-2">
              <input 
                type="button" 
                onClick={checkInputString} 
                className="btn btn-success align-self-end" 
                value={isAnimating ? `Animating... Step ${animationStep}/${inputString.length}` : "Check string"}
                disabled={isAnimating} 
              />
            </div>
          </div>

          {/* DFA Specification Import Section */}
          <div className="row mt-4">
            <div className="col-12">
              <h4>Import DFA Specification</h4>
              <div className="form-group">
                <textarea
                  className="form-control"
                  rows="10"
                  value={dfaSpecification}
                  onChange={(e) => setDfaSpecification(e.target.value)}
                  placeholder="Paste DFA specification here in the format: SPEC_DFA = { ... }"
                />
              </div>
              <div className="mt-2">
                <button 
                  className="btn btn-primary me-2"
                  onClick={() => parseDfaSpecification(dfaSpecification)}
                >
                  Build DFA from Specification
                </button>
                <button 
                  className="btn btn-secondary"
                  onClick={loadDefaultDfa}
                >
                  Load Default DFA
                </button>
              </div>
            </div>
          </div>
        </div>
        
        <div style={{ height: "50vh", width: "80vw", border: "1px solid", marginTop: "20px" }}>
          <Graph
            key={graphVersion}        // ← only changes on STRUCTURAL edits
            graph={graphData}
            options={options}
          />
        </div>
      </main>
    </div>
  )
}
