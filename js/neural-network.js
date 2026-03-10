/**
 * Simple three-layer neural network for GPS pattern recognition.
 * Input: [hour, dayOfWeek, latitude, longitude, accuracy, speed]
 * Output: [predictedAccuracy, recommendUpdate, energyMode]
 */
export class NeuralNetwork {
  /**
   * @param {number} inputSize
   * @param {number} hiddenSize
   * @param {number} outputSize
   */
  constructor(inputSize, hiddenSize, outputSize) {
    this.inputSize = inputSize;
    this.hiddenSize = hiddenSize;
    this.outputSize = outputSize;

    this.weightsIH = this.randomMatrix(inputSize, hiddenSize);
    this.weightsHO = this.randomMatrix(hiddenSize, outputSize);
    this.biasH = this.randomArray(hiddenSize);
    this.biasO = this.randomArray(outputSize);

    this.learningRate = 0.1;
    this.trainingCount = 0;
  }

  /** @returns {number[][]} */
  randomMatrix(rows, cols) {
    return Array(rows).fill(0).map(() =>
      Array(cols).fill(0).map(() => Math.random() * 2 - 1)
    );
  }

  /** @returns {number[]} */
  randomArray(size) {
    return Array(size).fill(0).map(() => Math.random() * 2 - 1);
  }

  /** @param {number} x @returns {number} */
  sigmoid(x) {
    return 1 / (1 + Math.exp(-x));
  }

  /** @param {number} x @returns {number} */
  sigmoidDerivative(x) {
    return x * (1 - x);
  }

  /**
   * Forward pass through the network.
   * @param {number[]} inputs
   * @returns {{ hidden: number[], outputs: number[] }}
   */
  forward(inputs) {
    const hidden = this.biasH.map((bias, i) => {
      let sum = bias;
      for (let j = 0; j < inputs.length; j++) {
        sum += inputs[j] * this.weightsIH[j][i];
      }
      return this.sigmoid(sum);
    });

    const outputs = this.biasO.map((bias, i) => {
      let sum = bias;
      for (let j = 0; j < hidden.length; j++) {
        sum += hidden[j] * this.weightsHO[j][i];
      }
      return this.sigmoid(sum);
    });

    return { hidden, outputs };
  }

  /**
   * Run inference.
   * @param {number[]} inputs
   * @returns {number[]}
   */
  predict(inputs) {
    return this.forward(inputs).outputs;
  }

  /**
   * Train the network on one sample with backpropagation.
   * @param {number[]} inputs
   * @param {number[]} targets
   */
  train(inputs, targets) {
    const { hidden, outputs } = this.forward(inputs);

    const outputErrors = outputs.map((o, i) => targets[i] - o);
    const outputGradients = outputs.map((o, i) =>
      outputErrors[i] * this.sigmoidDerivative(o) * this.learningRate
    );

    const hiddenErrors = hidden.map((h, i) => {
      let error = 0;
      for (let j = 0; j < outputs.length; j++) {
        error += this.weightsHO[i][j] * outputErrors[j];
      }
      return error;
    });

    const hiddenGradients = hidden.map((h, i) =>
      hiddenErrors[i] * this.sigmoidDerivative(h) * this.learningRate
    );

    for (let i = 0; i < hidden.length; i++) {
      for (let j = 0; j < outputs.length; j++) {
        this.weightsHO[i][j] += hiddenGradients[j] * hidden[i];
      }
    }

    for (let i = 0; i < inputs.length; i++) {
      for (let j = 0; j < hidden.length; j++) {
        this.weightsIH[i][j] += hiddenGradients[j] * inputs[i];
      }
    }

    for (let i = 0; i < outputs.length; i++) {
      this.biasO[i] += outputGradients[i];
    }
    for (let i = 0; i < hidden.length; i++) {
      this.biasH[i] += hiddenGradients[i];
    }

    this.trainingCount++;
  }

  /**
   * Reinitialize all weights and reset the training counter.
   * Use this instead of creating a new instance when the shared reference must be kept.
   */
  reset() {
    this.weightsIH = this.randomMatrix(this.inputSize, this.hiddenSize);
    this.weightsHO = this.randomMatrix(this.hiddenSize, this.outputSize);
    this.biasH = this.randomArray(this.hiddenSize);
    this.biasO = this.randomArray(this.outputSize);
    this.trainingCount = 0;
  }

  /**
   * Serialize network state for persistence.
   * @returns {Object}
   */
  save() {
    return {
      inputSize: this.inputSize,
      hiddenSize: this.hiddenSize,
      outputSize: this.outputSize,
      weightsIH: this.weightsIH,
      weightsHO: this.weightsHO,
      biasH: this.biasH,
      biasO: this.biasO,
      trainingCount: this.trainingCount
    };
  }

  /**
   * Restore network state from a previously saved object.
   * @param {Object} data
   */
  load(data) {
    this.inputSize = data.inputSize;
    this.hiddenSize = data.hiddenSize;
    this.outputSize = data.outputSize;
    this.weightsIH = data.weightsIH;
    this.weightsHO = data.weightsHO;
    this.biasH = data.biasH;
    this.biasO = data.biasO;
    this.trainingCount = data.trainingCount || 0;
  }
}
