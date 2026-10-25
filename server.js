import app from './api/index.js';

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Browser Phone Dialer running at http://localhost:${PORT}`);
  console.log(`Vobiz Answer URL: http://localhost:${PORT}/vobiz/answer`);
});
