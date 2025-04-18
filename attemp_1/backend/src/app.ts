import express from 'express';
import { router } from './routes';

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use('/api', router);

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

export default app;
