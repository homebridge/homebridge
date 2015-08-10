var Route = ReactRouter.Route;
var DefaultRoute = ReactRouter.DefaultRoute;
var NotFoundRoute = ReactRouter.NotFoundRoute;
var RouteHandler = ReactRouter.RouteHandler; 
var Link = ReactRouter.Link;
var ProviderGrid = require('./providers.jsx').ProviderGrid;
var Admin = require('./admin.jsx').Admin;
var NotificationCenter = require('./notifications.jsx').NotificationCenter;

var App = React.createClass({
  getInitialState: function() {
    return { root: null };
  },
  
  componentDidMount: function() {
    
    // pass the connection and the id of the data you want to synchronize
    var client = new diffsync.Client(io(), "root");
    
    client.on('connected', function(){
      // initial data was loaded - pass it on to our state
      this.setState({ root: client.getData() });
      
      // if we're using browser-refresh to auto-reload the browser during development, then
      // we'll receive the URL to a JS script in this location (see Server.js)
      if (this.state.root.browserRefreshURL) {
        var script = document.createElement('script');
        script.setAttribute('src', this.state.root.browserRefreshURL);
        document.head.appendChild(script);
      }
      
    }.bind(this));

    client.on('synced', function(){
      // server has updated our data - pass it on to our state
      this.setState({ root: client.getData() });
      
    }.bind(this));

    client.initialize();
  },
  
  render: function() {
    var root = this.state.root;
    
    return root && (
      <div>
        <nav className="navbar navbar-default navbar-static-top">
          <div className="container">
            <div className="navbar-header">
              <Link className="navbar-brand" to="/" style={{opacity:root.serverChange}}>homebridge</Link>
            </div>
            <div id="navbar" className="navbar-collapse collapse">
              <ul className="nav navbar-nav navbar-right">
                
                {/* Notification Center dropdown */}
                <li className="dropdown">
                  <a href="#" className="dropdown-toggle" data-toggle="dropdown" role="button" aria-haspopup="true" aria-expanded="false">
                    <span className="glyphicon glyphicon-bell" aria-hidden="true"></span>  
                  </a>
                  <div className="dropdown-menu" style={{padding:"10px"}}>
                    <NotificationCenter notifications={root.notifications}/>
                  </div>
                </li>

                {/* Settings dropdown */}
                <li className="dropdown">
                  <a href="#" className="dropdown-toggle" data-toggle="dropdown" role="button" aria-haspopup="true" aria-expanded="false">
                    <span className="glyphicon glyphicon-cog" aria-hidden="true"></span>  
                  </a>
                  <ul className="dropdown-menu">
                    <li><Link to="/admin">Admin</Link></li>
                  </ul>
                </li>
                
              </ul>
            </div>
          </div>
        </nav>
        <RouteHandler root={root}/>
      </div>
    );
  }
});

var Home = React.createClass({
  render: function() {
    return (
      <div className="container">
        <ProviderGrid root={this.props.root}/>
      </div>
    );
  }
});

var NotFound = React.createClass({
  render() {
    return (
      <div className="container" style={{textAlign:"center",marginTop:"100px"}}>
        <h1>That page could not be found.</h1>
      </div>
    )
  }
});

var routes = (
  <Route path="/" handler={App}>
    <DefaultRoute handler={Home}/>
    <Route name="admin" handler={Admin}/>
    <NotFoundRoute handler={NotFound}/>
  </Route>
);

ReactRouter.run(routes, ReactRouter.HistoryLocation, function (Handler) {
  React.render(<Handler/>, document.body);
});
