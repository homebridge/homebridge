var Link = ReactRouter.Link;

/**
 * Provider Grid - displays all created providers.
 */

module.exports.ProviderGrid = React.createClass({

  render() {
    var root = this.props.root;
    
    return (
      <div className="container">

        {/* need a wrapper div to counteract card margins around the conatiner edges */}
        <div style={Styles.cardsWrapper}>
          {root.providers.map(function(provider) { 
            <ProviderCard provider={provider} key={provider.key}/>
          })}
          <ProviderCard/>
          <ProviderCard/>
        </div>

        {/* add provider */}
        <AddProviderButton plugins={root.plugins}/>
        
      </div>
    )
  },
});

/**
 * Provider "Card"
 */

var ProviderCard = React.createClass({
  render() {
    var provider = this.props.provider;
    
    var imageStyle = {
      background: "url(//pbs.twimg.com/profile_images/519977105543528448/HAc6jtgo_400x400.png)",
      backgroundSize: "cover",
      height: "100%"
    }

    return (
      <div className="panel panel-default" style={Styles.card} onClick={this.cardClicked}>
        <div className="panel-body" style={Styles.cardBody}>
          <div style={imageStyle}></div>
        </div>
        <div className="panel-footer" style={Styles.cardFooter}>
          WeMo
          <span style={Styles.cardTimestamp}>
            5 accessories
          </span>
        </div>
      </div>
    )
  },
  
  cardClicked() {
    console.log("Click!");
  }
});

/**
 * Add Provider button + dialog
 */

var AddProviderButton = React.createClass({
  getInitialState() {
    return {
      selectedPlugin: null,
      selectedProvider: null,
      newProviderName: null
    }
  },
  
  render() {
    var plugins = this.props.plugins;

    return (
      <div>
        
        <div style={Styles.addProvider}>
          <button type="button" className="btn btn-primary btn-lg" data-toggle="modal" data-target="#addProviderModal">
            Add Provider
          </button>
        </div>

        <div className="modal fade" id="addProviderModal" tabIndex="-1" role="dialog">
          <div className="modal-dialog" role="document">
            <div className="modal-content">
              <div className="modal-header">
                <button type="button" className="close" data-dismiss="modal"><span>&times;</span></button>
                <h4 className="modal-title">Add New Provider</h4>
              </div>
              <div className="modal-body">
                
                <form className="form-horizontal">
                  <div className="form-group">
                    <label htmlFor="inputEmail3" className="col-sm-2 control-label">Provider</label>
                    <div className="col-sm-5">
                      <ProvidersDropdown plugins={plugins} selectedProvider={this.state.selectedProvider} onSelectProvider={this.onSelectProvider}/>
                    </div>
                  </div>
                  <div className="form-group">
                    <label htmlFor="inputPassword3" className="col-sm-2 control-label">Name</label>
                    <div className="col-sm-5">
                      <input type="text" className="form-control" id="inputPassword3" placeholder={
                        (this.state.selectedProvider && this.state.selectedProvider.title) || null
                      }/>
                    </div>
                  </div>
                </form>
                
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-default" data-dismiss="modal">Cancel</button>
                <button type="button" className="btn btn-primary">Add</button>
              </div>
            </div>
          </div>
        </div>
      
      </div>
    )
  },
  
  onSelectProvider(plugin, provider) {
    this.setState({
      selectedPlugin: plugin,
      selectedProvider: provider
    });
  }
});


/**
 * Providers Dropdown
 */

var ProvidersDropdown = React.createClass({
  render() {
    var plugins = this.props.plugins;
    
    var items = [];
    
    plugins.forEach(function(plugin) {
      items.push(<li key={plugin.name} className="dropdown-header">{plugin.name}</li>);
      
      plugin.providers.forEach(function(provider) {
        items.push(
          <li key={'provider-'+provider.name}>
            <a href="#" onClick={function() { this.onSelectProvider(plugin, provider); }.bind(this) }>
              {provider.title}
            </a>
          </li>
        );
      }.bind(this));
      
    }.bind(this));
    
    return (
      <div className="dropdown">
        <button className="btn btn-default dropdown-toggle" type="button" data-toggle="dropdown">
          { (this.props.selectedProvider && this.props.selectedProvider.title) || 'Select Provider' }
          &nbsp;
          <span className="caret"></span>
        </button>
        <ul className="dropdown-menu">
          { items }
        </ul>
      </div>
    )
  },
  
  onSelectProvider(plugin, provider) {
    if (this.props.onSelectProvider)
      this.props.onSelectProvider(plugin, provider);
  }
});


/**
 * CSS Styles
 */

var Styles = {
  cardsWrapper: {
    margin: "-10px"
  },
  card: {
    width: "150px",
    display: "inline-block",
    margin: "10px",
    cursor: "pointer"
  },
  cardBody: {
    height: "150px",
    padding: "0"
  },
  cardFooter: {
    fontSize:"100%",
    fontWeight:"bold",
    textAlign: "center",
    background: "#fafafa"
  },
  cardTimestamp: {
    fontSize: "80%",
    fontWeight: "lighter",
    display: "block",
  },
  addProvider: {
    margin: "30px",
    textAlign: "center"
  }
};