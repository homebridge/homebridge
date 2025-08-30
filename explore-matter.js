const matter = require('@matter/main');

console.log('=== All exports ===');
const allKeys = Object.keys(matter);
console.log(`Total exports: ${allKeys.length}`);

console.log('\n=== Device related ===');
const deviceKeys = allKeys.filter(key => key.includes('Device'));
console.log(deviceKeys);

console.log('\n=== Cluster related ===');
const clusterKeys = allKeys.filter(key => key.toLowerCase().includes('cluster'));
console.log(clusterKeys);

console.log('\n=== Common device patterns ===');
const commonDevices = allKeys.filter(key => 
  key.includes('OnOff') || 
  key.includes('Switch') || 
  key.includes('Light') || 
  key.includes('Dimmer') ||
  key.includes('Door') ||
  key.includes('Window') ||
  key.includes('Temperature') ||
  key.includes('Sensor')
);
console.log(commonDevices);

// Try to access specific exports to understand their structure
console.log('\n=== DeviceTypeId structure ===');
try {
  console.log(typeof matter.DeviceTypeId);
  if (matter.DeviceTypeId && typeof matter.DeviceTypeId === 'object') {
    console.log(Object.keys(matter.DeviceTypeId).slice(0, 10));
  }
} catch (e) {
  console.log('Error accessing DeviceTypeId:', e.message);
}

console.log('\n=== ClusterId structure ===');
try {
  console.log(typeof matter.ClusterId);
  if (matter.ClusterId && typeof matter.ClusterId === 'object') {
    console.log(Object.keys(matter.ClusterId).slice(0, 10));
  }
} catch (e) {
  console.log('Error accessing ClusterId:', e.message);
}