

module.exports.Admin = React.createClass({
  render: function() {
    return (
      <div className="container">
        <h2>Installed Plugins</h2>
        <ul>
          { this.props.root.plugins.map(function(plugin) {
            return <li key={plugin.name}>{plugin.name}</li>
          })}
        </ul>
      </div>
    );
  }
});
