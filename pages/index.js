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

  // Parse DFA specification and build the graph
  const parseDfaSpecification = () => {
    try {
      // Extract the DFA specification from the text
      const specMatch = dfaSpecification.match(/SPEC_DFA\s*=\s*\{([\s\S]*)\}/);
      if (!specMatch) throw new Error("Invalid DFA specification format");
      
      const specText = specMatch[0];
      
      // Parse alphabet
      const alphabetMatch = specText.match(/'alphabet':\s*\{([^}]*)\}/);
      if (!alphabetMatch) throw new Error("Could not find alphabet in specification");
      
      // Parse states
      const statesMatch = specText.match(/'states':\s*\{([^}]*)\}/);
      if (!statesMatch) throw new Error("Could not find states in specification");
      
      // Parse initial state
      const initialStateMatch = specText.match(/'initial_state':\s*'([^']*)'/);
      if (!initialStateMatch) throw new Error("Could not find initial state in specification");
      const initialState = initialStateMatch[1];
      
      // Parse accepting states
      const acceptingStatesMatch = specText.match(/'accepting_states':\s*\{([^}]*)\}/);
      if (!acceptingStatesMatch) throw new Error("Could not find accepting states in specification");
      
      const acceptingStates = acceptingStatesMatch[1].split(',').map(s => {
        const match = s.match(/'([^']*)'/);
        return match ? match[1] : null;
      }).filter(s => s !== null);
      
      // Parse transitions
      const transitionsText = specText.substring(specText.indexOf("'transitions'"));
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
      
      // Update graph data
      setGraphData(newGraph);
      setGraphVersion(v => v + 1); // bump version on structural change
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
    setGraphVersion(v => v + 1); // bump version on structural change
  };

  // Allow only A, C, and 0 characters
  const handleStringInput = (e) => e.target.value.match(/(^[AC0]+$|^$)/g) && setInputString(e.target.value);

  // Helper function to reset animation colors
  const resetAnimationColors = () => {
    let newGraph = JSON.parse(JSON.stringify(graphData));
    
    // Reset all nodes to default color
    newGraph.nodes.forEach(node => {
      if (node.color && node.color.background) {
        delete node.color.background;
      }
    });
    
    // Reset all edges to default color
    newGraph.edges.forEach(edge => {
      if (edge.color) {
        delete edge.color;
      }
    });
    
    return newGraph;
  };

  // Animated check input string function
  const animateCheckInputString = async () => {
    setIsAnimating(true);
    setAnimationStep(0);
    
    let currNodeId = 1;
    let accepted = inputString.length > 0;
    let newGraph = resetAnimationColors();
    
    // Highlight the starting node
    const startNode = newGraph.nodes.find(node => node.id === currNodeId);
    if (startNode) {
      startNode.color = { background: '#90CAF9' };
      setGraphData(newGraph);
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000)); // Initial delay
    
    // Traverse automata according to input with animation
    for (let idx = 0; idx < inputString.length; idx++) {
      const value = inputString[idx];
      let nextEdge = newGraph.edges.find(x => x.from === currNodeId && x.label.includes(value));
      
      if (nextEdge) {
        // Highlight the edge
        nextEdge.color = { color: '#1E88E5', highlight: '#1E88E5' };
        setGraphData(JSON.parse(JSON.stringify(newGraph)));
        setAnimationStep(idx + 1);
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Move to next node and highlight it
        currNodeId = nextEdge.to;
        const currNode = newGraph.nodes.find(x => x.id === currNodeId);
        currNode.color = { background: '#90CAF9' };
        setGraphData(JSON.parse(JSON.stringify(newGraph)));
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Check if this is the last step
        if (idx === inputString.length - 1) {
          const currNodeObj = newGraph.nodes.find(x => x.id === currNodeId);
          accepted = !!currNodeObj.title && currNodeObj.title === "accepting";
          
          // Highlight final state in green if accepted, red if rejected
          currNodeObj.color = { background: accepted ? '#A5D6A7' : '#EF9A9A' };
          setGraphData(JSON.parse(JSON.stringify(newGraph)));
          
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } else {
        // If no transition, end animation and mark as rejected
        accepted = false;
        alert('No transition found for ' + value + ' from state ' + currNodeId);
        break;
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
    setGraphVersion(v => v + 1); // bump version on structural change
  }

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

            <button className="btn btn-secondary m-2" onClick={() => addNewState()}>Add new state</button>
            <button className="btn btn-secondary m-2" onClick={() => addNewState(true)}>Add new accepting state</button>

            <button className="btn btn-secondary m-2" onClick={() => makeStartStateAccepting()}>Make start state accepting</button>
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
              <button 
                className="btn btn-primary mt-2"
                onClick={parseDfaSpecification}
              >
                Build DFA from Specification
              </button>
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
