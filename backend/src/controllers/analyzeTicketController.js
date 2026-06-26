const analyzeTicket = async (req, res) => {
  try {
    return res.status(200).json({
      status: 'success',
      message: 'Ticket analyzed successfully',
    });
  } catch (err) {
    return res.status(500).json({
      status: 'error',
      message: err.message,
    });
  }
};

module.exports = { analyzeTicket };
