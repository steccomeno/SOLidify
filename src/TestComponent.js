import React from 'react';

const TestComponent = () => {
  return (
    <div style={{ padding: '40px', textAlign: 'center' }}>
      <h1>SOLidify Test Component</h1>
      <p>This is a test component to verify that React rendering is working correctly.</p>
      <div style={{ 
        marginTop: '20px', 
        padding: '20px', 
        backgroundColor: '#f0f0f0',
        borderRadius: '8px' 
      }}>
        <p>If you can see this, the basic rendering is working!</p>
      </div>
    </div>
  );
};

export default TestComponent; 