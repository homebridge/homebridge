
module.exports.NotificationCenter = React.createClass({
  render: function() {
    
    var notifications = this.props.notifications;
    
    if (!notifications || notifications.length == 0) return (
      <div style={{color:"#999"}}>No Notifications</div>
    )
    
    return (
      <div>
        { notifications.map(function(notification, index) {
          return <div key={index}>{notification.message}</div>;
        }) }
      </div>
    );
  }
});