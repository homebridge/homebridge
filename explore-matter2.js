const matter = require('@matter/main');

// Try to call DeviceTypeId as function to see what it returns
console.log('=== DeviceTypeId function test ===');
try {
  console.log('DeviceTypeId() result:', matter.DeviceTypeId());
} catch (e) {
  console.log('DeviceTypeId() error:', e.message);
}

// Try to call ClusterId as function to see what it returns
console.log('\n=== ClusterId function test ===');
try {
  console.log('ClusterId() result:', matter.ClusterId());
} catch (e) {
  console.log('ClusterId() error:', e.message);
}

// Look for other specific exports that might contain device types
console.log('\n=== Looking for specific Matter exports ===');
const allKeys = Object.keys(matter);

// Filter for potential cluster/device exports
const potentialClusters = allKeys.filter(key => 
  key.includes('Cluster') || 
  key.includes('cluster') ||
  key.includes('Device') ||
  key.includes('device') ||
  key.endsWith('Id') ||
  key.includes('Type')
);

potentialClusters.forEach(key => {
  console.log(`${key}: ${typeof matter[key]}`);
});

// Look for any standard Matter device constants
console.log('\n=== Looking for constants ===');
const constants = allKeys.filter(key => key === key.toUpperCase());
console.log('Constants found:', constants.slice(0, 20));