import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
class DashboardBoundary extends React.Component<{children:React.ReactNode},{failed:boolean}>{
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true}}
  render(){return this.state.failed?<main><div className="empty"><h1>Let’s reload the court.</h1><p>This view could not be drawn. Your published data is safe.</p><button className="primary" onClick={()=>location.reload()}>Reload dashboard</button></div></main>:this.props.children}
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <DashboardBoundary><App /></DashboardBoundary>
  </React.StrictMode>,
);
